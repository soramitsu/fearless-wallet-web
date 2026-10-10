import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pairs: new Map<string, ReturnType<typeof pair>>(), migrate: vi.fn(), unlock: vi.fn(), lock: vi.fn(), enroll: vi.fn(),
  master: '',
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  getPair: (address: string) => {
    const pair = mocks.pairs.get(address);
    if (!pair) throw new Error('Missing pair');
    return pair;
  },
  getAccounts: () => [...mocks.pairs.values()],
  getAddresses: () => [],
  migrateWithMasterPassword: mocks.migrate,
  unlockKeyring: mocks.unlock, lockAll: mocks.lock,
  // Like @subwallet/keyring unlockPair: decode with the master password held in memory.
  unlockPair: (address: string) => {
    if (!mocks.master) throw new Error('Please unlock first');
    try { mocks.pairs.get(address).decodePkcs8(mocks.master); } catch { throw new Error(`Fail to unlock with address: ${address}`); }
  },
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
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {} }));
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
  Object.defineProperty(value, 'tonKeyring', {
    value: { getAccounts: () => [], accountSubject: { value: {} }, vault: { needsPreviousPassword: new Set() } },
  });
  return value;
}

beforeEach(() => {
  mocks.pairs.clear();
  mocks.master = '';
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
    pair(EVM);
    const keyring = service();
    expect(keyring.getMigrationAccounts()).toEqual([
      expect.objectContaining({ address: EVM, isEthereum: true, walletEcosystem: 'evm', linkedParentAddress: SUBSTRATE }),
    ]);
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([EVM]);
    expect(keyring.getMigrationAccounts()).toEqual([]);
    expect(mocks.pairs.size).toBe(2);
  });

  // 3.0.5 → HEAD (E14): a JSON-imported EVM child can have its own password. The parent row must not
  // report "invalid password" when the parent's password is correct.
  it('migrates the parent when its password is correct and keeps a differently encrypted child as its own row', async () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM, false, 'separate-evm-password');
    const keyring = service();
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([SUBSTRATE]);
    expect(parent.meta.isMasterPassword).toBe(true);
    expect(child.meta.isMasterPassword).toBe(false);
    expect(child.isLocked).toBe(true);
    expect(keyring.getMigrationAccounts()).toEqual([expect.objectContaining({ address: EVM, linkedParentAddress: SUBSTRATE })]);

    expect(await keyring.keyringMigrateMasterPassword({ address: EVM, password: 'separate-evm-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([SUBSTRATE, EVM]);
    expect(keyring.getMigrationAccounts()).toEqual([]);
    expect(mocks.pairs.size).toBe(2);
  });

  it('writes nothing and re-locks both accounts when the password opens neither', async () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM, false, 'separate-evm-password');
    const keyring = service();
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'incorrect' })).toBe(false);
    expect(await keyring.keyringMigrateMasterPassword({ address: EVM, password: 'legacy-password' })).toBe(false);
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(parent.meta.isMasterPassword).toBe(false);
    expect(child.meta.isMasterPassword).toBe(false);
    expect(parent.isLocked).toBe(true);
    expect(child.isLocked).toBe(true);
    expect(keyring.getMigrationAccounts().map(({ address }) => address)).toEqual([SUBSTRATE, EVM]);
  });

  it('retries a partial failure without reencrypting an already migrated account', async () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM);
    mocks.migrate.mockImplementationOnce(() => { parent.meta.isMasterPassword = true; })
      .mockImplementationOnce(() => { throw new Error('Injected interruption'); });
    const keyring = service();
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    // The requested account was committed; the child that failed stays pending as its own row.
    expect(keyring.getMigrationAccounts()).toEqual([expect.objectContaining({ address: EVM })]);
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(mocks.migrate.mock.calls.map(([address]) => address)).toEqual([SUBSTRATE, EVM, EVM]);
    expect(keyring.getMigrationAccounts()).toEqual([]);
    expect(mocks.pairs.size).toBe(2);
    expect(parent.publicKey).toEqual(new Uint8Array([1, 2, 3]));
    expect(child.publicKey).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reports a storage failure of the requested account as not migrated, and a retry succeeds', async () => {
    const parent = pair(SUBSTRATE);
    mocks.migrate.mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    const keyring = service();
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(false);
    expect(parent.meta.isMasterPassword).toBe(false);
    expect(await keyring.keyringMigrateMasterPassword({ address: SUBSTRATE, password: 'legacy-password' })).toBe(true);
    expect(parent.meta.isMasterPassword).toBe(true);
  });

  it('refuses to unlock an account that still needs its legacy password, leaving its linked account locked', () => {
    const parent = pair(SUBSTRATE);
    const child = pair(EVM, true, 'master-password');
    mocks.master = 'master-password';
    const keyring = service();
    expect(() => keyring.unlockPair(SUBSTRATE)).toThrow('legacy_password_required');
    expect(parent.decodePkcs8).not.toHaveBeenCalled();
    expect(child.decodePkcs8).not.toHaveBeenCalled();
    expect(parent.isLocked).toBe(true);
    expect(child.isLocked).toBe(true);
  });

  it('keeps a migrated account signing while its linked account still waits for its legacy password', () => {
    const parent = pair(SUBSTRATE, true, 'master-password');
    const child = pair(EVM, false, 'separate-evm-password');
    mocks.master = 'master-password';
    const keyring = service();
    expect(keyring.unlockPair(SUBSTRATE)).toBe(true);
    expect(parent.isLocked).toBe(false);
    expect(child.decodePkcs8).not.toHaveBeenCalled();
    expect(() => keyring.unlockPair(EVM)).toThrow('legacy_password_required');
    expect(() => keyring.accountExportPrivateKey({ address: EVM })).toThrow('legacy_password_required');
  });

  it('answers false without flagging anything while the keyring is locked', () => {
    const parent = pair(SUBSTRATE, true, 'master-password');
    const keyring = service();
    expect(keyring.unlockPair(SUBSTRATE)).toBe(false);
    expect(parent.isLocked).toBe(true);
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
