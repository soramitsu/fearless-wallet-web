import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// chrome.storage.local, kept between "service workers" like the browser keeps it.
const storage = vi.hoisted(() => ({ records: new Map<string, unknown>(), failWrites: false }));
vi.mock('@extension-base/utils/crossenv', () => {
  const chrome = {
    runtime: { lastError: undefined as undefined | { message: string } },
    storage: {
      local: {
        get: (keys: string[] | null, done: (result: Record<string, unknown>) => void) =>
          setTimeout(() =>
            done(Object.fromEntries([...storage.records].filter(([key]) => !keys || keys.includes(key)).map(([key, value]) => [key, structuredClone(value)])))
          ),
        set: (items: Record<string, unknown>, done: () => void) =>
          setTimeout(() => {
            if (storage.failWrites) chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
            else Object.entries(items).forEach(([key, value]) => storage.records.set(key, structuredClone(value)));
            done();
            chrome.runtime.lastError = undefined;
          }),
        remove: (keys: string | string[], done: () => void) =>
          setTimeout(() => {
            [keys].flat().forEach((key) => storage.records.delete(key));
            done();
          }),
      },
    },
  };

  return { chrome };
});

import AccountsStore from '@extension-base/stores/Accounts';
import {
  ecdsaAccountKeys,
  ecdsaPairKeys,
  reconcileEcdsaAccountRecords,
  type AccountRecordArchive,
} from '@extension-base/stores/EcdsaAccountRecords';
// chrome.storage.local as the real Fearless Wallet 3.0.6 (3.0.5 keyring code) and 2.6.3 builds wrote it
// (tests/fixtures/upgrade/README.md).
import profile306 from '../fixtures/upgrade/s2-3.0.6-ecdsa.json';
import profile263 from '../fixtures/upgrade/s3-2.6.3-ecdsa-per-account-passwords.json';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

type Records = Record<string, KeyringPair$Json | AccountRecordArchive<KeyringPair$Json>>;

const NOW = 1_791_700_000_000;
// The account records of a profile, as AccountsStore reads them (without the `fw:` prefix).
const shippedRecords = (profile: typeof profile306 | typeof profile263): Record<string, KeyringPair$Json> =>
  Object.fromEntries(
    Object.entries(profile.storage)
      .filter(([key]) => key.startsWith('fw:'))
      .map(([key, value]) => [key.slice('fw:'.length), structuredClone(value) as unknown as KeyringPair$Json])
  );
const ecdsaWallets = profile306.wallets.filter(({ type }) => type === 'ecdsa');

let keyring: Keyring;
const ecdsaPair = (json: KeyringPair$Json) => keyring.createFromJson(json);
const keysOf = (address: string) => {
  const shipped = Object.values(shippedRecords(profile306)).find((json) => ecdsaPair(json).address === address)!;

  return ecdsaAccountKeys(ecdsaPair(shipped).publicKey)!;
};

function applied(stored: Records, writes: ReturnType<typeof reconcileEcdsaAccountRecords>['writes']): Records {
  const next = { ...stored };
  writes.forEach(({ set, remove }) => {
    Object.assign(next, set);
    remove.forEach((key) => delete next[key]);
  });
  return next;
}

beforeAll(async () => {
  await cryptoWaitReady();
  keyring = new Keyring({ type: 'ecdsa' });
});

beforeEach(() => {
  storage.records.clear();
  storage.failWrites = false;
});

describe('the storage keys of an ECDSA Substrate account', () => {
  it('are what each keyring version computes for the account', () => {
    for (const { address } of ecdsaWallets) {
      const stored = Object.entries(shippedRecords(profile306)).find(([, json]) => ecdsaPair(json).address === address)!;
      const pair = ecdsaPair(stored[1]);
      const keys = ecdsaPairKeys(pair)!;

      // 3.0.x: ui-keyring 0.1.7 accountKey(pair.address), the account id the address decodes to.
      expect(stored[0]).toBe(keys.legacy);
      expect(keys.legacy).toBe(`account:${u8aToHex(decodeAddress(address))}`);
      // 4.2.0: ui-keyring 0.1.14 genericSubject getStoreKey(address, pair.publicKey).
      expect(keys.current).toBe(`account:${u8aToHex(pair.publicKey)}`);
      expect(keys.current).not.toBe(keys.legacy);
    }
  });

  it('only exist for ECDSA pairs', () => {
    const sr25519 = new Keyring({ type: 'sr25519' }).addFromUri(profile306.wallets[2].mnemonic + '//daily');
    const ethereum = new Keyring({ type: 'ethereum' }).addFromUri(`${profile306.wallets[0].mnemonic}/m/44'/60'/0'/0/0`);

    expect(ecdsaPairKeys(sr25519)).toBeUndefined();
    expect(ecdsaPairKeys(ethereum)).toBeUndefined();
  });
});

describe('loading ECDSA accounts that 3.0.x or 2.x stored under their account id', () => {
  it.each([
    ['3.0.6', profile306],
    ['2.6.3', profile263],
  ])('loads each %s account once, under its public key, and sets the old record aside as it was', (_version, profile) => {
    const stored = shippedRecords(profile);
    const { records, writes } = reconcileEcdsaAccountRecords(stored, NOW);

    for (const { address } of profile.wallets.filter(({ type }) => type === 'ecdsa')) {
      const [legacyKey, shipped] = Object.entries(stored).find(([, json]) => ecdsaPair(json).address === address)!;
      const keys = ecdsaPairKeys(ecdsaPair(shipped))!;

      expect(legacyKey).toBe(keys.legacy);
      expect(records[keys.legacy]).toBeUndefined();
      expect(records[keys.current]).toEqual(shipped);
      expect(writes).toContainEqual({
        set: {
          [keys.current]: shipped,
          [keys.archive]: { account: keys.current, records: [{ key: keys.legacy, record: shipped, archivedAt: NOW }] },
        },
        remove: [keys.legacy],
      });
    }
    expect(writes).toHaveLength(2);
    // sr25519 and Ethereum accounts keep their key, and everything else is untouched.
    for (const [key, value] of Object.entries(stored)) {
      if (!writes.some(({ remove }) => remove.includes(key))) expect(records[key]).toEqual(value);
    }
  });

  it('writes nothing at the next load', () => {
    const stored = shippedRecords(profile306);
    const once = applied(stored, reconcileEcdsaAccountRecords(stored, NOW).writes);
    const twice = reconcileEcdsaAccountRecords(once, NOW + 1);

    expect(twice.writes).toEqual([]);
    expect(twice.records).toEqual(once);
  });

  // An RC build before this fix copied the old record to the new key at every load and wrote only there.
  it('keeps the record an earlier 4.2.0 build changed, and still sets the old one aside', () => {
    const stored = shippedRecords(profile306);
    const keys = keysOf(ecdsaWallets[0].address);
    const shipped = stored[keys.legacy];
    const renamed = { ...shipped, encoded: 'reencrypted with the new master password', meta: { ...shipped.meta, name: 'Renamed' } };
    const { records, writes } = reconcileEcdsaAccountRecords({ ...stored, [keys.current]: renamed }, NOW);

    expect(records[keys.current]).toEqual(renamed);
    expect(records[keys.legacy]).toBeUndefined();
    expect(writes).toContainEqual({
      set: { [keys.archive]: { account: keys.current, records: [{ key: keys.legacy, record: shipped, archivedAt: NOW }] } },
      remove: [keys.legacy],
    });
  });

  it('only removes the old record when an interrupted load already stored the account and the archive', () => {
    const stored = shippedRecords(profile306);
    const keys = keysOf(ecdsaWallets[0].address);
    const interrupted = { ...stored, ...reconcileEcdsaAccountRecords(stored, NOW).writes[0].set };
    const { records, writes } = reconcileEcdsaAccountRecords(interrupted, NOW + 1);

    expect(writes).toContainEqual({ set: {}, remove: [keys.legacy] });
    expect(records[keys.current]).toEqual(stored[keys.legacy]);
  });

  // WK-10 keeps a rollback to a clean 3.0.x build possible. That build reads the record under the new key, writes
  // it under the old one again and keeps every change there.
  it('takes the record a 3.0.x build wrote after the upgrade, and keeps the one it replaces', () => {
    const stored = shippedRecords(profile306);
    const keys = keysOf(ecdsaWallets[0].address);
    const shipped = stored[keys.legacy];
    const upgraded = applied(stored, reconcileEcdsaAccountRecords(stored, NOW).writes);
    const changedIn420 = { ...shipped, encoded: 'changed in 4.2.0' };
    const changedAfterRollback = { ...shipped, encoded: 'changed by 3.0.x after a rollback' };
    const rolledBack = { ...upgraded, [keys.current]: changedIn420, [keys.legacy]: changedAfterRollback };
    const { records, writes } = reconcileEcdsaAccountRecords(rolledBack, NOW + 1);

    expect(records[keys.current]).toEqual(changedAfterRollback);
    expect(writes).toEqual([
      {
        set: {
          [keys.current]: changedAfterRollback,
          [keys.archive]: {
            account: keys.current,
            records: [
              { key: keys.legacy, record: shipped, archivedAt: NOW },
              { key: keys.current, record: changedIn420, archivedAt: NOW + 1 },
              { key: keys.legacy, record: changedAfterRollback, archivedAt: NOW + 1 },
            ],
          },
        },
        remove: [keys.legacy],
      },
    ]);
  });

  it('leaves records it does not recognise as they are', () => {
    const stored = shippedRecords(profile306);
    const keys = keysOf(ecdsaWallets[0].address);
    const other = keysOf(ecdsaWallets[1].address);
    const unknown = {
      ...stored,
      [keys.current]: { address: '0xnot-this-account', meta: {} } as unknown as KeyringPair$Json,
      [other.archive]: { note: 'not an archive' } as unknown as KeyringPair$Json,
      'account:0x1234': { address: stored[keys.legacy].address, meta: { name: 'External' } } as unknown as KeyringPair$Json,
    };
    const { records, writes } = reconcileEcdsaAccountRecords(unknown, NOW);

    expect(writes).toEqual([]);
    expect(records).toEqual(unknown);
  });
});

describe('AccountsStore.all', () => {
  const seed = (profile: typeof profile306) =>
    Object.entries(profile.storage).forEach(([key, value]) => storage.records.set(key, structuredClone(value)));
  // Waits for every queued wallet write, including the ones whose failure is not reported.
  const settled = (store: AccountsStore) => store.getAndWait('nothing');

  it('hands each ECDSA account to the keyring once and moves the old record into the archive', async () => {
    seed(profile306);
    const store = new AccountsStore();
    const loaded: string[] = [];

    await store.all((key) => loaded.push(key));
    await settled(store);

    for (const { address } of ecdsaWallets) {
      const keys = keysOf(address);
      const shipped = profile306.storage[`fw:${keys.legacy}` as keyof typeof profile306.storage];

      expect(loaded).toContain(keys.current);
      expect(loaded).not.toContain(keys.legacy);
      expect(storage.records.has(`fw:${keys.legacy}`)).toBe(false);
      expect(storage.records.get(`fw:${keys.current}`)).toEqual(shipped);
      expect(storage.records.get(`fw:${keys.archive}`)).toEqual({
        account: keys.current,
        records: [{ key: keys.legacy, record: shipped, archivedAt: expect.any(Number) }],
      });
    }

    // The next service worker reads the same accounts and writes nothing.
    const before = structuredClone(Object.fromEntries(storage.records));
    const next = new AccountsStore();
    const reloaded: string[] = [];
    await next.all((key) => reloaded.push(key));
    await settled(next);
    expect(reloaded.filter((key) => key.startsWith('account:')).sort()).toEqual(loaded.filter((key) => key.startsWith('account:')).sort());
    expect(Object.fromEntries(storage.records)).toEqual(before);
  });

  it('still loads every account when the write fails, and moves the record at the next load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seed(profile306);
    storage.failWrites = true;
    const store = new AccountsStore();
    const loaded: string[] = [];

    await expect(store.all((key) => loaded.push(key))).resolves.toBeUndefined();
    await settled(store);
    for (const { address } of ecdsaWallets) expect(loaded).toContain(keysOf(address).current);
    // Nothing was removed: the old records are still where 3.0.x left them.
    expect(Object.fromEntries(storage.records)).toEqual(profile306.storage);

    storage.failWrites = false;
    await new AccountsStore().all(() => {});
    await settled(store);
    for (const { address } of ecdsaWallets) expect(storage.records.has(`fw:${keysOf(address).legacy}`)).toBe(false);
  });
});
