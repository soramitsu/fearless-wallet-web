import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pairs: new Map<string, Record<string, unknown>>(),
  hash: '',
  prompt: new Map<string, unknown>(),
  promptReadFails: false,
  reset: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: { get hasMasterPassword() { return !!mocks.hash; } },
  getPair: (address: string) => {
    const pair = mocks.pairs.get(address);
    if (!pair) throw new Error('Missing pair');
    return pair;
  },
  getAccounts: () => [...mocks.pairs.values()],
  getAddresses: () => [],
  resetWallet: mocks.reset,
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async (key: string) => {
    if (mocks.promptReadFails) throw new Error('IO error: LOCK file in use');
    return mocks.prompt.get(key);
  };
  setAndWait = async (key: string, value: unknown) => { mocks.prompt.set(key, value); };
  remove = (key: string) => { mocks.prompt.delete(key); };
} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
// Extension is exercised through its prototype; its services are never built.
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import { KeyringService } from '@extension-base/services/keyring-service';
import Extension from '@extension-base/background/handlers/Extension';

const PARENT = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const KUSAMA = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const MIGRATED = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y';
const EXTERNAL = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
const HARDWARE = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';
const CHILD = '0x1111111111111111111111111111111111111111';
const ORPHAN_CHILD = '0x2222222222222222222222222222222222222222';
const STANDALONE = '0x3333333333333333333333333333333333333333';

// Shaped like a @subwallet/keyring pair: functions and typed arrays that extension messaging
// cannot serialize.
function pair(address: string, meta: Record<string, unknown> = {}) {
  const value = {
    address,
    type: address.startsWith('0x') ? 'ethereum' : 'sr25519',
    meta: { isMasterPassword: false, ...meta },
    publicKey: new Uint8Array([1, 2, 3]),
    isLocked: true,
    decodePkcs8: vi.fn(),
    lock: vi.fn(),
    sign: vi.fn(),
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

function hasOnlyPlainData(value: unknown): boolean {
  if (typeof value === 'function' || ArrayBuffer.isView(value)) return false;
  if (value && typeof value === 'object') return Object.values(value).every(hasOnlyPlainData);
  return true;
}

beforeEach(() => {
  mocks.pairs.clear();
  mocks.prompt.clear();
  mocks.promptReadFails = false;
  mocks.hash = 'master-password';
  mocks.reset.mockReset().mockImplementation(() => { mocks.hash = ''; mocks.pairs.clear(); });
});

describe('legacy per-account password list', () => {
  function legacyWallet() {
    // Keyring order deliberately differs from the order the list is shown in.
    pair(STANDALONE, { name: 'Imported EVM' });
    pair(CHILD);
    pair(PARENT, { name: 'Polkadot', ethereumAddress: CHILD, whenCreated: 1_700_000_000_000 });
    pair(ORPHAN_CHILD);
    pair(MIGRATED, { name: 'Migrated', isMasterPassword: true, ethereumAddress: ORPHAN_CHILD });
    pair(KUSAMA, { name: 'Kusama', walletEcosystem: 'substrate' });
    pair(EXTERNAL, { name: 'Watch only', isExternal: true });
    pair(HARDWARE, { name: 'Ledger', isHardware: true });
  }

  it('is plain data that survives structured cloning and JSON, grouped parent first', () => {
    legacyWallet();
    const accounts = service().getMigrationAccounts();

    expect(accounts).toStrictEqual([
      {
        address: PARENT, name: 'Polkadot', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false,
        ethereumAddress: CHILD, whenCreated: 1_700_000_000_000,
      },
      {
        address: CHILD, name: '', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true,
        linkedParentAddress: PARENT, linkedParentName: 'Polkadot',
      },
      { address: KUSAMA, name: 'Kusama', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false },
      {
        address: ORPHAN_CHILD, name: '', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true,
        linkedParentAddress: MIGRATED, linkedParentName: 'Migrated',
      },
      { address: STANDALONE, name: 'Imported EVM', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true },
    ]);
    expect(structuredClone(accounts)).toStrictEqual(accounts);
    expect(JSON.parse(JSON.stringify(accounts))).toStrictEqual(accounts);
    expect(hasOnlyPlainData(accounts)).toBe(true);
  });

  it('answers the popup through the background handler without a serialization failure', async () => {
    legacyWallet();
    const keyringService = service();
    const extension = { state: { keyringService } } as unknown as Extension;

    // The pairs themselves cannot cross the message boundary (W1: "Could not serialize message").
    expect(() => structuredClone([...mocks.pairs.values()])).toThrow();

    const accounts = await Extension.prototype.handle.call(extension, 'id', 'pri(keyring.getMigrationAccounts)', null);
    expect(structuredClone(accounts)).toStrictEqual(keyringService.getMigrationAccounts());
    const status = await Extension.prototype.handle.call(extension, 'id', 'pri(keyring.getAccessStatus)', null);
    expect(structuredClone(status)).toStrictEqual(status);
    expect(await Extension.prototype.handle.call(extension, 'id', 'pri(keyring.isNeedMigration)', null)).toBe(true);
  });

  it('lists every pending account as an access issue, with its encrypted backup available', async () => {
    legacyWallet();
    const { issues } = await service().getAccessStatus();

    expect(issues).toStrictEqual([
      { address: PARENT, walletEcosystem: 'substrate', kind: 'legacy_account_password', name: 'Polkadot', canDownloadEncryptedBackup: true },
      { address: CHILD, walletEcosystem: 'evm', kind: 'legacy_account_password', name: '', linkedParentAddress: PARENT, canDownloadEncryptedBackup: true },
      { address: KUSAMA, walletEcosystem: 'substrate', kind: 'legacy_account_password', name: 'Kusama', canDownloadEncryptedBackup: true },
      { address: ORPHAN_CHILD, walletEcosystem: 'evm', kind: 'legacy_account_password', name: '', linkedParentAddress: MIGRATED, canDownloadEncryptedBackup: true },
      { address: STANDALONE, walletEcosystem: 'evm', kind: 'legacy_account_password', name: 'Imported EVM', canDownloadEncryptedBackup: true },
    ]);
  });
});

describe('when the per-account password prompt is shown', () => {
  it.each([
    ['no master password and a local legacy account', '', () => pair(PARENT), true, true],
    ['no master password and only a legacy EVM account', '', () => pair(STANDALONE), true, true],
    ['a master password and a legacy sr25519 account', 'master-password', () => pair(PARENT), false, true],
    ['a master password and only legacy EVM accounts', 'master-password', () => { pair(CHILD); pair(STANDALONE); }, false, false],
    ['a master password and only migrated or external accounts', 'master-password', () => {
      pair(MIGRATED, { isMasterPassword: true });
      pair(EXTERNAL, { isExternal: true });
    }, false, false],
    ['no accounts', 'master-password', () => {}, false, false],
  ])('%s', async (_, hash, accounts, mustCreateMasterPassword, promptPending) => {
    mocks.hash = hash;
    accounts();
    const keyring = service();

    expect(await keyring.getAccessStatus()).toMatchObject({
      hasMasterPassword: !!hash,
      mustCreateMasterPassword,
      promptPending,
      deferred: false,
    });
    expect(await keyring.isNeedMigration()).toBe(promptPending);
  });

  it('stops forcing the prompt after "Skip for now" while the accounts stay listed', async () => {
    pair(PARENT, { name: 'Polkadot' });
    const keyring = service();

    expect(await keyring.deferLegacyPasswordMigration()).toBe(true);

    expect(mocks.prompt.get('legacyPasswordPrompt')).toEqual({ deferredAt: expect.any(Number) });
    expect(await keyring.getAccessStatus()).toMatchObject({
      promptPending: false,
      deferred: true,
      issues: [expect.objectContaining({ address: PARENT, kind: 'legacy_account_password' })],
    });
    expect(await keyring.isNeedMigration()).toBe(false);
    expect(mocks.pairs.has(PARENT)).toBe(true);
  });

  it('cannot be skipped without a master password, since the wallet could not be unlocked', async () => {
    mocks.hash = '';
    pair(PARENT);
    const keyring = service();

    expect(await keyring.deferLegacyPasswordMigration()).toBe(false);
    expect(mocks.prompt.size).toBe(0);
    expect(await keyring.isNeedMigration()).toBe(true);
  });

  it('is shown again after a wallet reset', async () => {
    pair(PARENT);
    const keyring = service();
    expect(await keyring.deferLegacyPasswordMigration()).toBe(true);

    expect(keyring.resetWallet()).toBe(true);

    expect(mocks.reset).toHaveBeenCalledWith(true);
    expect(mocks.prompt.size).toBe(0);
    mocks.hash = 'new-master-password';
    pair(KUSAMA);
    expect(await keyring.getAccessStatus()).toMatchObject({ deferred: false, promptPending: true });
  });

  it('is shown when the skip choice cannot be read, rather than blocking the wallet', async () => {
    pair(PARENT);
    mocks.prompt.set('legacyPasswordPrompt', { deferredAt: 1 });
    mocks.promptReadFails = true;
    const keyring = service();

    expect(await keyring.getAccessStatus()).toMatchObject({ deferred: false, promptPending: true });
    mocks.promptReadFails = false;
    expect(await keyring.getAccessStatus()).toMatchObject({ deferred: true, promptPending: false });
  });

  it('remembers a choice skipped in an earlier session', async () => {
    pair(PARENT);
    mocks.prompt.set('legacyPasswordPrompt', { deferredAt: 1 });

    expect(await service().isNeedMigration()).toBe(false);
  });
});
