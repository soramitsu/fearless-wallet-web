import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ persist: vi.fn(), publish: vi.fn(), add: vi.fn(), decode: vi.fn(), current: undefined as unknown }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class { updateAndWait = mocks.persist; } }));
vi.mock('@subwallet/ui-keyring/defaults', () => ({ accountKey: (address: string) => `account:${address}` }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  getPair: () => mocks.current,
  createFromJson: (json) => ({ ...json, decodePkcs8: mocks.decode, lock: vi.fn(), haveEntropy: true }),
  keyring: {
    createJsonPairWithMasterPassword: (copy) => {
      copy.meta.isMasterPassword = true;
      return { address: copy.address, encoded: 'new-encrypted-fixture', meta: copy.meta };
    },
    addFromJson: mocks.add,
  },
  accounts: { add: mocks.publish },
} }));

import { upgradeLegacyAccountPassword } from '@extension-base/services/keyring-service/LegacyPasswordUpgrade';

function originalPair() {
  const meta = { name: 'Legacy', isMasterPassword: false, pendingMigrate: true };
  const original = {
    address: '0x1111111111111111111111111111111111111111', publicKey: new Uint8Array(32),
    meta, isLocked: true, lock: vi.fn(),
    toJson: vi.fn(() => ({ address: 'fixture-json-address', encoded: 'old-encrypted-fixture', meta })),
  };
  mocks.current = original;
  return original;
}

async function persist(_key, transform, publish) {
  const next = transform({ address: 'fixture-json-address', encoded: 'old-encrypted-fixture', meta: (mocks.current as ReturnType<typeof originalPair>).meta });
  if (next) publish?.(next);
  return next;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decode.mockReset();
  mocks.persist.mockImplementation(persist);
  mocks.add.mockImplementation((json) => ({ ...json, publicKey: new Uint8Array(32), type: 'ethereum' }));
});

describe('durable legacy password upgrade', () => {
  it('keeps the original encrypted pair pending when storage rejects, then permits retry', async () => {
    const original = originalPair();
    mocks.persist.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(upgradeLegacyAccountPassword(original as never, 'old-password')).rejects.toThrow('disk unavailable');
    expect(original.meta).toEqual({ name: 'Legacy', isMasterPassword: false, pendingMigrate: true });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    await upgradeLegacyAccountPassword(original as never, 'old-password');
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenLastCalledWith(`account:${original.address}`, expect.any(Function), expect.any(Function));
    expect(mocks.add).toHaveBeenLastCalledWith(expect.objectContaining({
      encoded: 'new-encrypted-fixture', meta: { name: 'Legacy', isMasterPassword: true, isMasterAccount: true },
    }));
  });

  it('publishes completion only after the storage acknowledgement', async () => {
    let commit!: () => void;
    mocks.persist.mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => { commit = resolve; });
      return persist(...args as [unknown, unknown, unknown]);
    });
    const original = originalPair();
    const pending = upgradeLegacyAccountPassword(original as never, 'old-password');
    expect(original.meta.isMasterPassword).toBe(false);
    expect(mocks.add).not.toHaveBeenCalled();
    commit();
    await pending;
    expect(mocks.publish).toHaveBeenCalledOnce();
    const store = mocks.publish.mock.calls[0][0];
    store.set('already-committed', {});
    expect(mocks.persist).toHaveBeenCalledOnce();
  });

  it('preserves lock state and avoids writes when decoding fails', async () => {
    const original = originalPair();
    mocks.decode.mockImplementation(() => { throw new Error('wrong password'); });
    await expect(upgradeLegacyAccountPassword(original as never, 'incorrect')).rejects.toThrow('wrong password');
    expect(original.lock).toHaveBeenCalledOnce();
    expect(original.meta.isMasterPassword).toBe(false);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
