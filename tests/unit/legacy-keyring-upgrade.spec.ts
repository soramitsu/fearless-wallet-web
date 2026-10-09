import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pairs: new Map<string, ReturnType<typeof pair>>(), migrate: vi.fn(), unlock: vi.fn(), lock: vi.fn(), enroll: vi.fn() }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  getPair: (address: string) => {
    const pair = mocks.pairs.get(address);
    if (!pair) throw new Error('Missing pair');
    return pair;
  },
  getAccounts: () => [...mocks.pairs.values()],
  migrateWithMasterPassword: mocks.migrate,
  unlockKeyring: mocks.unlock, lockAll: mocks.lock,
} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: mocks.enroll }));
vi.mock('@extension-base/services/keyring-service/LegacyPasswordUpgrade', () => ({
  upgradeLegacyAccountPassword: (pair, password) => mocks.migrate(pair.address, password),
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: {} }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: {} }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

import { KeyringService } from '@extension-base/services/keyring-service';

const SUBSTRATE = '5LegacyFixture';
const EVM = '0x1111111111111111111111111111111111111111';

function pair(address: string, migrated = false, password = 'legacy-password') {
  const value = {
    address,
    type: address === EVM ? 'ethereum' : 'sr25519',
    meta: { isMasterPassword: migrated, ethereumAddress: address === SUBSTRATE ? EVM : undefined },
    publicKey: new Uint8Array([1, 2, 3]),
    isLocked: true,
    decodePkcs8: vi.fn((provided: string) => {
      if (provided !== password) throw new Error('Incorrect password');
      value.isLocked = false;
    }),
    lock: vi.fn(() => { value.isLocked = true; }),
  };
  mocks.pairs.set(address, value);
  return value;
}

function service() {
  const value = Object.create(KeyringService.prototype) as KeyringService;
  Object.defineProperty(value, 'tonKeyring', { value: { getAccounts: () => [] } });
  return value;
}

beforeEach(() => {
  mocks.pairs.clear();
  mocks.enroll.mockReset().mockResolvedValue(undefined);
  mocks.unlock.mockReset();
  mocks.lock.mockReset();
  mocks.migrate.mockReset().mockImplementation((address: string) => {
    mocks.pairs.get(address).meta.isMasterPassword = true;
  });
});

describe('legacy encrypted account upgrade', () => {
  it.each(['isExternal', 'isHardware', 'isInjected', 'isMobile'])(
    'keeps %s accounts available without requiring a nonexistent local password', async (flag) => {
      const external = pair(SUBSTRATE);
      external.meta[flag] = true;
      const keyring = service();
      expect(keyring.getMigrationAccounts()).toEqual([]);
      expect(await keyring.keyringMigrateMasterPassword({ address: external.address, password: '' })).toBe(true);
      expect(external.decodePkcs8).not.toHaveBeenCalled();
      expect(mocks.migrate).not.toHaveBeenCalled();
      expect(mocks.pairs.get(SUBSTRATE)).toBe(external);
    }
  );

  it('retains pending EVM accounts after an older partial parent migration', async () => {
    pair(SUBSTRATE, true);
    const child = pair(EVM);
    const keyring = service();
    expect(keyring.getMigrationAccounts()).toEqual([child]);
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([EVM]);
    expect(keyring.getMigrationAccounts()).toEqual([]);
    expect(mocks.pairs.size).toBe(2);
  });

  it('validates linked passwords before changing either encrypted account', async () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM, false, 'separate-evm-password');
    expect(await service().keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(false);
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(parent.meta.isMasterPassword).toBe(false);
    expect(child.meta.isMasterPassword).toBe(false);
    expect(parent.isLocked).toBe(true);
    expect(child.isLocked).toBe(true);
  });

  it('retries a partial failure without reencrypting an already migrated child', async () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM);
    mocks.migrate.mockImplementationOnce(() => { child.meta.isMasterPassword = true; })
      .mockImplementationOnce(() => { throw new Error('Injected interruption'); });
    const keyring = service();
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(false);
    expect(keyring.getMigrationAccounts()).toEqual([parent]);
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([EVM, SUBSTRATE, SUBSTRATE]);
    expect(mocks.pairs.size).toBe(2);
    expect(parent.publicKey).toEqual(new Uint8Array([1, 2, 3]));
    expect(child.publicKey).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('keeps standalone legacy EVM imports visible while grouping only actually linked children', () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM);
    const independentAddress = '0x2222222222222222222222222222222222222222';
    const independent = { address: independentAddress, meta: { name: 'Legacy EVM import' } };
    const keyring = service();
    const accounts = [parent, child, independent];
    Object.defineProperty(keyring, 'getAllAccounts', { value: () => accounts });
    const listed = keyring.getAllMainAccounts();
    expect(listed.map(({ address }) => address)).toEqual([SUBSTRATE, independentAddress]);
    expect(listed[1].meta).toMatchObject({ walletEcosystem: 'evm', ethereumAddress: independentAddress });
    expect(independent.meta).toEqual({ name: 'Legacy EVM import' });
    accounts.splice(0, 1);
    expect(keyring.getAllMainAccounts().map(({ address }) => address)).toEqual([EVM, independentAddress]);
  });

  it('recognizes a TON-only installation as an existing wallet', () => {
    const keyring = service();
    Object.defineProperty(keyring, 'getAllAccounts', { value: () => [] });
    vi.spyOn(keyring.tonKeyring, 'getAccounts').mockReturnValue([{ address: 'ton-fixture' }] as never);
    expect(keyring.hasAccounts).toBe(true);
  });
});


describe('legacy enrollment lifecycle', () => {
  it('returns successful unlock before optional derivation and discards work after lock', async () => {
    const original = pair(SUBSTRATE, true);
    let finish!: () => void;
    mocks.enroll.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const wallet = service();
    expect(wallet.unlockKeyring({ password: 'master-password' })).toBe(true);
    expect(mocks.enroll).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mocks.enroll).toHaveBeenCalledOnce());
    const isCurrent = mocks.enroll.mock.calls[0][2];
    expect(isCurrent()).toBe(true);
    expect(wallet.lockKeyring()).toBe(true);
    expect(isCurrent()).toBe(false);
    finish();
    await wallet.waitForLegacyNetworkEnrollment();
    expect(mocks.pairs.get(SUBSTRATE)).toBe(original);
  });

  it('does not make unlock fail when derivation rejects, and retries on a later unlock', async () => {
    pair(SUBSTRATE, true);
    mocks.enroll.mockRejectedValueOnce(new Error('Optional dependency unavailable'));
    const wallet = service();
    expect(wallet.unlockKeyring({ password: 'master-password' })).toBe(true);
    await wallet.waitForLegacyNetworkEnrollment();
    expect(wallet.unlockKeyring({ password: 'master-password' })).toBe(true);
    await wallet.waitForLegacyNetworkEnrollment();
    expect(mocks.enroll).toHaveBeenCalledTimes(2);
  });

  it('does not retain an incorrect password or schedule generation after failed unlock', async () => {
    pair(SUBSTRATE, true);
    mocks.unlock.mockImplementation(() => { throw new Error('Wrong password'); });
    const wallet = service();
    expect(wallet.unlockKeyring({ password: 'incorrect' })).toBe(false);
    expect(wallet.getPassword()).not.toBe('incorrect');
    await wallet.waitForLegacyNetworkEnrollment();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});
