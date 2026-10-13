import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ECDSA Substrate accounts written by real 3.0.6 (3.0.5 keyring code) and 2.6.3 builds, upgraded, changed and
// deleted, across service worker restarts. Each "worker" is a fresh module graph over the same
// chrome.storage.local; the stores and the keyring service are the real ones.
//
// @subwallet/keyring needs Cardano WASM the unit environment cannot load. The stand-in below keeps what
// @subwallet/ui-keyring 0.1.14 does with storage, line for line where it matters (Keyring.loadAccount,
// forgetAccount, changeMasterPassword, resetWallet; genericSubject getStoreKey; defaults accountKey), over
// @polkadot/keyring pairs, which have the same encrypted JSON, decodePkcs8/toJson and addresses.
const hoisted = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  uiKeyring: undefined as unknown,
  createUiKeyring: undefined as unknown as () => unknown,
}));

vi.mock('@extension-base/utils/crossenv', () => {
  const later = (run: () => void) => setTimeout(run);
  const chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (keys: string[] | null, done: (result: Record<string, unknown>) => void) =>
          later(() =>
            done(Object.fromEntries([...hoisted.storage].filter(([key]) => !keys || keys.includes(key)).map(([key, value]) => [key, structuredClone(value)])))
          ),
        set: (items: Record<string, unknown>, done?: () => void) =>
          later(() => {
            Object.entries(items).forEach(([key, value]) => hoisted.storage.set(key, structuredClone(value)));
            done?.();
          }),
        remove: (keys: string | string[], done?: () => void) =>
          later(() => {
            [keys].flat().forEach((key) => hoisted.storage.delete(key));
            done?.();
          }),
      },
    },
  };

  return { chrome };
});
// Mocked modules outlive vi.resetModules, so they answer for the keyring of the current worker.
vi.mock('@subwallet/ui-keyring', () => ({
  keyring: new Proxy({}, { get: (_target, property) => Reflect.get(hoisted.uiKeyring as object, property) }),
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({
  accounts: { get subject() { return (hoisted.uiKeyring as { accounts: { subject: unknown } }).accounts.subject; } },
}));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({
  TonKeyringService: class {
    accountSubject = { value: {} };
    getAccounts = () => [];
    vault = {
      needsPreviousPassword: new Set(),
      exclusive: <T>(run: () => Promise<T>) => run(),
      stage: async () => [],
      commit: async () => {},
      rollback: async () => {},
    };
  },
}));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

// chrome.storage.local as the real builds wrote it (tests/fixtures/upgrade/README.md).
import profile306 from '../fixtures/upgrade/s2-3.0.6-ecdsa.json';
import profile263 from '../fixtures/upgrade/s3-2.6.3-ecdsa-per-account-passwords.json';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';

type AccountsStoreLike = { set: (key: string, json: KeyringPair$Json) => void; remove: (key: string) => void };
type Subject = { value: Record<string, { json: KeyringPair$Json; type: string }> };

hoisted.createUiKeyring = () => {
  const backend = new Keyring({ type: 'sr25519' });
  const accountKey = (key: string) => `account:${u8aToHex(decodeAddress(key, true))}`; // defaults.js
  const storeKey = (address: string, rawKey: Uint8Array | string) =>
    isEthereumAddress(address) ? address : typeof rawKey === 'string' ? rawKey : u8aToHex(rawKey); // getStoreKey
  let store: AccountsStoreLike;
  let passwordStore: { get: (done: (json?: { passwordHash: string }) => void) => void; set: (json: object) => void; remove: () => void };
  let passwordHash: string | undefined;
  let master = '';
  const accounts = {
    subject: { value: {} } as Subject,
    add(target: AccountsStoreLike, address: string, rawKey: Uint8Array | string, json: KeyringPair$Json, type: string) {
      accounts.subject.value = { ...accounts.subject.value, [address]: { json: { ...json, address }, type } };
      if (!json.meta.isInjected) target.set(accountKey(storeKey(address, rawKey)), json);
    },
    removeSubjectOnly(address: string) {
      const { [address]: _removed, ...rest } = accounts.subject.value;
      accounts.subject.value = rest;
    },
    remove(target: AccountsStoreLike, address: string, rawKey: string) {
      const { [address]: _removed, ...rest } = accounts.subject.value;
      accounts.subject.value = rest;
      target.remove(accountKey(storeKey(address, rawKey)));
    },
  };
  const masterPairs = () => backend.getPairs().filter(({ meta }) => meta.isMasterPassword && !meta.isInjected);
  const opens = (pair: KeyringPair, password: string) => {
    try {
      backend.createFromJson(accounts.subject.value[pair.address].json).decodePkcs8(password);
      return true;
    } catch {
      return false;
    }
  };
  // Instead of the bcrypt hash: a password is checked against a stored key, or by value before any key uses it.
  const verify = (password: string) =>
    masterPairs().length ? opens(masterPairs()[0], password) : passwordHash === `stand-in:${password}`;
  const forgetAccount = (address: string) => {
    const pair = backend.getPair(address);
    const key = isEthereumAddress(address) ? address : u8aToHex(pair.publicKey); // Pairs.remove returns the public key
    backend.removePair(address);
    accounts.remove(store, address, key);
  };
  let ready: Promise<void> = Promise.resolve();

  return {
    accounts,
    get ready() { return ready; },
    keyring: {
      get hasMasterPassword() { return !!passwordHash; },
      get isLocked() { return !master; },
      createJsonPairWithMasterPassword: (pair: KeyringPair) => {
        if (!master) throw new Error('Please unlock first');
        pair.setMeta({ isMasterPassword: true });
        return pair.toJson(master);
      },
      addFromJson: (json: KeyringPair$Json) => backend.addFromJson(json),
      addPair: (pair: KeyringPair) => backend.addPair(pair),
      removePair: (address: string) => backend.removePair(address),
    },
    loadAll(options: { store: AccountsStoreLike & { all: (load: (key: string, json: KeyringPair$Json) => void) => void }; password_store: typeof passwordStore }) {
      store = options.store;
      passwordStore = options.password_store;
      ready = new Promise((resolve) => passwordStore.get((json) => { passwordHash = json?.passwordHash; resolve(); }));
      options.store.all((key, json) => {
        if (!/^account:0x[0-9a-f]*/.test(key)) return;
        // Keyring.loadAccount; rewriteKey returns early because the key is hex.
        if (!json.meta.isTesting && json.encoded) {
          const pair = backend.addFromJson(json, true);
          accounts.add(store, pair.address, pair.publicKey, json, pair.type);
        }
      });
    },
    // Keyring.loadAccount, which loadAll calls for each stored record.
    loadAccount: (json: KeyringPair$Json, key: string) => {
      if (!/^account:0x[0-9a-f]*/.test(key) || json.meta.isTesting || !json.encoded) return;
      const pair = backend.addFromJson(json, true);
      accounts.add(store, pair.address, pair.publicKey, json, pair.type);
    },
    getPair: (address: string) => backend.getPair(address),
    getAccounts: () => Object.entries(accounts.subject.value).map(([address, { json }]) => ({ address, meta: json.meta })),
    getAddresses: () => [],
    createFromJson: (json: KeyringPair$Json) => backend.createFromJson(json),
    unlockKeyring: (password: string) => {
      if (!passwordHash) throw new Error('Create password first');
      if (!verify(password)) throw new Error('Invalid master password');
      master = password;
    },
    unlockPair: (address: string) => {
      if (!master) throw new Error('Please unlock first');
      backend.getPair(address).decodePkcs8(master);
    },
    lockAll: () => {
      master = '';
      backend.getPairs().forEach((pair) => pair.lock());
    },
    // Keyring.changeMasterPassword: the new hash is stored, then every master-password pair is stored again,
    // encrypted with the new password.
    changeMasterPassword: (next: string, old?: string) => {
      if (passwordHash && (!old || !verify(old))) throw new Error('Invalid master password');
      const pairs = masterPairs();
      pairs.forEach((pair) => pair.isLocked && pair.decodePkcs8(old));
      passwordHash = `stand-in:${next}`;
      master = next;
      passwordStore.set({ passwordHash });
      for (const json of pairs.map((pair) => pair.toJson(next))) {
        const pair = backend.addFromJson(json, true);
        accounts.add(store, pair.address, pair.publicKey, json, pair.type);
      }
    },
    forgetAccount,
    resetWallet: () => {
      Object.keys(accounts.subject.value).forEach(forgetAccount);
      passwordStore.remove();
      passwordHash = undefined;
      master = '';
    },
  };
};

const ACCOUNT = 'fw:account:';
const ARCHIVE = 'fw:archivedAccount:';
const DELETED = 'fw:deletedWallet:';
const NEW_MASTER = 'Master password changed in 4.2.0';
const payload = new TextEncoder().encode('Fearless ECDSA upgrade check');
// Every key opens with real scrypt; 4.2.0 re-encrypts with N = 2^17.
const SCRYPT_SUITE = { timeout: 240_000 };

let checker: Keyring;

/** A new service worker: fresh modules, the same chrome.storage.local. */
async function startWorker() {
  vi.resetModules();
  hoisted.uiKeyring = hoisted.createUiKeyring();
  const { KeyringService } = await import('@extension-base/services/keyring-service');
  const { default: AccountsStore } = await import('@extension-base/stores/Accounts');
  const { default: BaseExtensionStore } = await import('@extension-base/stores/BaseExtension');
  const service = new KeyringService({ waitCryptoReady: Promise.resolve(true) } as never);

  await service.loadAll();
  await (hoisted.uiKeyring as { ready: Promise<void> }).ready;

  return {
    service,
    // Every queued wallet write has landed, as before the browser closes the worker.
    settle: async () => {
      await BaseExtensionStore.flush();
      await new AccountsStore().getAndWait('settle');
    },
  };
}

const stored = () => Object.fromEntries(hoisted.storage) as Record<string, KeyringPair$Json>;
const accountRecords = () => Object.entries(stored()).filter(([key]) => key.startsWith(ACCOUNT));
// Every stored copy of a key, live or set aside, found by the public key in the record.
const copiesOf = (publicKeyHex: string) =>
  Object.entries(stored()).filter(([, value]) => JSON.stringify(value).includes(publicKeyHex.slice(2)));
const publicKeyOf = (json: KeyringPair$Json) => json.address.toLowerCase();
const shippedRecordOf = (profile: typeof profile306 | typeof profile263, address: string) =>
  Object.values(profile.storage as unknown as Record<string, KeyringPair$Json>).find(
    (json) => json.encoded && checker.createFromJson(json).address === address
  )!;
const liveRecordOf = (address: string) =>
  accountRecords().map(([, json]) => json).find((json) => checker.createFromJson(json).address === address);

function opensWith(json: KeyringPair$Json, password: string): KeyringPair | undefined {
  const pair = checker.createFromJson(json);
  try {
    pair.decodePkcs8(password);
    return pair;
  } catch {
    return undefined;
  }
}

beforeAll(async () => {
  await cryptoWaitReady();
  checker = new Keyring({ type: 'ecdsa' });
});

beforeEach(() => {
  hoisted.storage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ECDSA accounts from 3.0.x across service worker restarts', () => {
  const [signer, spare, daily] = profile306.wallets;
  const MASTER = profile306.provenance.masterPassword;

  beforeEach(() => {
    Object.entries(profile306.storage).forEach(([key, value]) => hoisted.storage.set(key, structuredClone(value)));
  });

  it('keeps a rename and a password change and does not bring a deleted account back', SCRYPT_SUITE, async () => {
    const first = await startWorker();
    const listed = first.service.getAccounts().map(({ address }) => address);

    expect(listed.sort()).toEqual(
      [signer.address, signer.ethereumAddress, spare.address, spare.ethereumAddress, daily.address].sort()
    );
    expect(first.service.unlockKeyring({ password: MASTER })).toBe(true);
    expect(await first.service.saveAccountMeta(signer.address, { name: 'Signer, renamed in 4.2.0' })).toBe(true);
    expect(await first.service.changeMasterPassword({ oldPassword: MASTER, newPassword: NEW_MASTER })).toBe(true);
    // Settings → Delete wallet: the keys are kept first, then the Ethereum account and the account are removed
    // (Extension.accountsForget).
    await first.service.forgetAccount(spare.address);
    await first.settle();

    const second = await startWorker();

    expect(second.service.getAccounts().map(({ address }) => address).sort()).toEqual(
      [signer.address, signer.ethereumAddress, daily.address].sort()
    );
    expect(second.service.getAccounts().find(({ address }) => address === signer.address)?.meta.name).toBe(
      'Signer, renamed in 4.2.0'
    );
    expect(second.service.unlockKeyring({ password: MASTER })).toBe(false);
    expect(second.service.unlockKeyring({ password: NEW_MASTER })).toBe(true);
    expect(second.service.unlockPair(signer.address)).toBe(true);

    // The deleted wallet is out of the keyring: no record under either key and no set-aside record any keyring
    // loads. Its keys are kept only in the deleted-wallet entry Account access restores from.
    const spareRecord = shippedRecordOf(profile306, spare.address);
    expect(copiesOf(publicKeyOf(spareRecord)).map(([key]) => key)).toEqual([expect.stringMatching(new RegExp(`^${DELETED}`))]);
    expect(liveRecordOf(spare.ethereumAddress)).toBeUndefined();

    // Exactly one live record for the renamed account: it opens with the new password only, and holds the key
    // the 3.0.6 phrase derives.
    const shipped = shippedRecordOf(profile306, signer.address);
    const live = accountRecords().filter(([, json]) => publicKeyOf(json) === publicKeyOf(shipped));
    expect(live.map(([key]) => key)).toEqual([`${ACCOUNT}${publicKeyOf(shipped)}`]);
    expect(live[0][1].meta.name).toBe('Signer, renamed in 4.2.0');
    expect(opensWith(live[0][1], MASTER)).toBeUndefined();
    const pair = opensWith(live[0][1], NEW_MASTER)!;
    const derived = checker.addFromUri(signer.mnemonic, {}, 'ecdsa');
    expect(pair.address).toBe(signer.address);
    expect(derived.verify(payload, pair.sign(payload), derived.publicKey)).toBe(true);

    // The record 3.0.6 wrote is kept, byte for byte, where no keyring loads it.
    const [[archiveKey, archive]] = copiesOf(publicKeyOf(shipped)).filter(([key]) => key.startsWith(ARCHIVE));
    expect(archiveKey).toBe(`${ARCHIVE}${u8aToHex(decodeAddress(signer.address))}`);
    expect(archive).toEqual({
      account: `account:${publicKeyOf(shipped)}`,
      records: [{ key: `account:${u8aToHex(decodeAddress(signer.address))}`, record: shipped, archivedAt: expect.any(Number) }],
    });
    expect(opensWith(shipped, MASTER)?.address).toBe(signer.address);

    // The sr25519 wallet kept its key and moved to the new password with the others.
    expect(opensWith(liveRecordOf(daily.address)!, NEW_MASTER)?.address).toBe(daily.address);
    // The writes this worker queued at its start land here, not in the storage of the next test.
    await second.settle();
  });

  it('keeps a deleted wallet where Account access restores it, exactly as it was, across restarts', SCRYPT_SUITE, async () => {
    const first = await startWorker();
    const spareRecord = shippedRecordOf(profile306, spare.address);

    expect(first.service.unlockKeyring({ password: MASTER })).toBe(true);
    await first.settle();
    const before = structuredClone(stored());
    await first.service.forgetAccount(spare.address);
    await first.settle();

    // Every record that held the wallet's keys, byte for byte, in one entry no keyring loads.
    const [[entryKey, entry]] = Object.entries(stored()).filter(([key]) => key.startsWith(DELETED)) as unknown as [string, {
      address: string; name: string; accounts: Record<string, unknown>;
    }][];
    expect(entry).toMatchObject({ address: spare.address, name: spareRecord.meta.name });
    // The account under its public key, the 3.0.6 record set aside at the first start, and the Ethereum account.
    expect(Object.keys(entry.accounts).sort()).toEqual(
      [
        `account:${publicKeyOf(spareRecord)}`,
        `archivedAccount:${u8aToHex(decodeAddress(spare.address))}`,
        `account:${spare.ethereumAddress.toLowerCase()}`,
      ].sort()
    );
    Object.entries(entry.accounts).forEach(([key, value]) => expect(value).toEqual(before[`fw:${key}`]));

    const second = await startWorker();
    expect(second.service.getAccounts().map(({ address }) => address)).not.toContain(spare.address);
    const deleted = await second.service.getDeletedWallets();
    expect(deleted).toEqual([
      { id: entryKey.slice(DELETED.length), address: spare.address, name: spareRecord.meta.name, walletEcosystem: 'substrate', deletedAt: expect.any(Number) },
    ]);

    expect(await second.service.restoreDeletedWallet(deleted[0].id)).toMatchObject({ ok: true, address: spare.address });
    await second.settle();
    expect(second.service.getAccounts().map(({ address }) => address)).toEqual(expect.arrayContaining([spare.address, spare.ethereumAddress]));
    expect(await second.service.getDeletedWallets()).toEqual([]);
    expect(Object.keys(stored()).filter((key) => key.startsWith(DELETED))).toEqual([]);
    // Restoring twice finds nothing to restore, and never writes over what is back.
    expect(await second.service.restoreDeletedWallet(deleted[0].id)).toEqual({ ok: false, code: 'not_found' });

    // At the next start the wallet is listed once, opens with the master password and signs with the key the
    // 3.0.6 phrase derives.
    const third = await startWorker();
    expect(third.service.getAccounts().filter(({ address }) => address === spare.address)).toHaveLength(1);
    expect(third.service.unlockKeyring({ password: MASTER })).toBe(true);
    expect(third.service.unlockPair(spare.address)).toBe(true);
    const live = accountRecords().filter(([, json]) => publicKeyOf(json) === publicKeyOf(spareRecord));
    expect(live).toHaveLength(1);
    const pair = opensWith(live[0][1], MASTER)!;
    const derived = checker.addFromUri(spare.mnemonic, {}, 'ecdsa');
    expect(pair.address).toBe(spare.address);
    expect(derived.verify(payload, pair.sign(payload), derived.publicKey)).toBe(true);
  });

  it('deletes nothing when the keys could not be kept', SCRYPT_SUITE, async () => {
    const first = await startWorker();
    await first.settle();
    const before = structuredClone(stored());
    const { default: AccountsStore } = await import('@extension-base/stores/Accounts');
    vi.spyOn(AccountsStore.prototype, 'mutateRecordsAndWait').mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    await expect(first.service.archiveWallet(spare.address)).rejects.toThrow('QUOTA_BYTES');
    await first.settle();
    expect(stored()).toEqual(before);
  });

  it('leaves no ECDSA record behind after Reset wallet, at the next start either', SCRYPT_SUITE, async () => {
    const first = await startWorker();

    expect(first.service.resetWallet()).toBe(true);
    await first.settle();
    expect(Object.keys(stored()).filter((key) => key.startsWith(ACCOUNT) || key.startsWith(ARCHIVE))).toEqual([]);

    const second = await startWorker();
    expect(second.service.getAccounts()).toEqual([]);
    expect(second.service.hasMasterPassword).toBe(false);
  });
});

describe('ECDSA accounts from 2.x (a password per account) across service worker restarts', () => {
  const [vault, spare] = profile263.wallets;
  const MASTER = 'Master password created during the upgrade';

  beforeEach(() => {
    Object.entries(profile263.storage).forEach(([key, value]) => hoisted.storage.set(key, structuredClone(value)));
  });

  it('keeps an account opened with its old password, and a deleted one stays deleted', SCRYPT_SUITE, async () => {
    const first = await startWorker();

    expect(first.service.getMigrationAccounts().map(({ address }) => address).sort()).toEqual(
      [vault.address, vault.ethereumAddress, spare.address, spare.ethereumAddress].sort()
    );
    expect(await first.service.changeMasterPassword({ newPassword: MASTER })).toBe(true);
    expect(await first.service.keyringMigrateMasterPassword({ address: vault.address, password: vault.password })).toBe(true);
    await first.service.forgetAccount(spare.address);
    await first.settle();

    const second = await startWorker();

    expect(second.service.getAccounts().map(({ address }) => address).sort()).toEqual(
      [vault.address, vault.ethereumAddress].sort()
    );
    // Not asked for the 2.6.3 password again: the account stays on the master password.
    expect(second.service.getMigrationAccounts()).toEqual([]);
    expect(second.service.unlockKeyring({ password: MASTER })).toBe(true);
    expect(second.service.unlockPair(vault.address)).toBe(true);

    const shipped = shippedRecordOf(profile263, vault.address);
    const live = accountRecords().filter(([, json]) => publicKeyOf(json) === publicKeyOf(shipped));
    expect(live).toHaveLength(1);
    expect(live[0][1].meta).toMatchObject({ name: 'Vault', isMasterPassword: true, whenCreated: shipped.meta.whenCreated });
    expect(opensWith(live[0][1], MASTER)?.address).toBe(vault.address);
    // The 2.6.3 record is kept as it was, still under the account's own password.
    const archived = copiesOf(publicKeyOf(shipped)).find(([key]) => key.startsWith(ARCHIVE))![1] as unknown as {
      records: { record: KeyringPair$Json }[];
    };
    expect(archived.records.map(({ record }) => record)).toEqual([shipped]);
    expect(opensWith(shipped, vault.password)?.address).toBe(vault.address);

    // The deleted wallet is kept, still under its 2.6.3 password, only where Account access restores it from.
    const spareShipped = shippedRecordOf(profile263, spare.address);
    const spareCopies = copiesOf(publicKeyOf(spareShipped));
    expect(spareCopies.map(([key]) => key)).toEqual([expect.stringMatching(new RegExp(`^${DELETED}`))]);
    expect(Object.values((spareCopies[0][1] as unknown as { accounts: Record<string, KeyringPair$Json> }).accounts)).toContainEqual(spareShipped);
  });
});
