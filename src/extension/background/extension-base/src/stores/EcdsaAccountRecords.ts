import { hexToU8a, isHex, isObject, u8aToHex } from '@polkadot/util';
import { blake2AsU8a } from '@polkadot/util-crypto';

// Fearless 2.x (@polkadot/ui-keyring 3.5.1) and 3.0.x (@subwallet/ui-keyring 0.1.7) store an account under the
// account id its address decodes to. For an ECDSA Substrate account that is the blake2 hash of its 33-byte public
// key; @subwallet/ui-keyring 0.1.14 stores the same account under the public key. 0.1.14 copies the old record to
// the new key at every load, never removes it (Keyring.rewriteKey returns early for hex keys) and deletes only the
// new key. Left alone, the old record brings a deleted account back at the next service worker start and, when
// it is loaded after the new one, undoes a password change or a rename.
//
// So the old record is set aside the first time it is loaded: kept as stored under `archivedAccount:`, which no
// keyring version loads, and removed from `account:` only after the account's record and the archive are stored.
// Deleting the account, or resetting the wallet, removes all three keys.

const ACCOUNT_PREFIX = 'account:';
const ARCHIVE_PREFIX = 'archivedAccount:';

export interface EcdsaAccountKeys {
  /** Where 4.2.0 stores the account: its public key. */
  current: string;
  /** Where 2.x and 3.0.x stored it: its account id. */
  legacy: string;
  /** The records set aside for it. */
  archive: string;
}

export interface ArchivedAccountRecord<T = unknown> {
  /** The key the record was stored under. */
  key: string;
  record: T;
  archivedAt: number;
}

export interface AccountRecordArchive<T = unknown> {
  /** The key of the account the records belong to. */
  account: string;
  records: ArchivedAccountRecord<T>[];
}

export interface AccountRecordsReconciliation<T> {
  /** What the keyring loads: the stored records, each ECDSA account once, under its current key. */
  records: Record<string, T>;
  /** Per account, the entries to store and then the keys to remove, in that order. */
  writes: { set: Record<string, unknown>; remove: string[] }[];
}

export function ecdsaAccountKeys(publicKey: Uint8Array): EcdsaAccountKeys | undefined {
  if (publicKey.length !== 33) return undefined;

  const accountId = u8aToHex(blake2AsU8a(publicKey));

  return {
    current: `${ACCOUNT_PREFIX}${u8aToHex(publicKey)}`,
    legacy: `${ACCOUNT_PREFIX}${accountId}`,
    archive: `${ARCHIVE_PREFIX}${accountId}`,
  };
}

export function ecdsaPairKeys(pair: { type: string; publicKey: Uint8Array }): EcdsaAccountKeys | undefined {
  return pair.type === 'ecdsa' ? ecdsaAccountKeys(pair.publicKey) : undefined;
}

// An encrypted ECDSA account record carries its compressed public key as its address (pair.toJson).
export function ecdsaRecordKeys(value: unknown): EcdsaAccountKeys | undefined {
  if (!isObject(value)) return undefined;

  const { address, encoded, encoding } = value as { address?: unknown; encoded?: unknown; encoding?: { content?: unknown } };
  const content = isObject(encoding) ? encoding.content : undefined;

  if (!encoded || !Array.isArray(content) || content[1] !== 'ecdsa' || !isHex(address)) return undefined;

  return ecdsaAccountKeys(hexToU8a(address));
}

function readArchive(value: unknown): AccountRecordArchive | undefined {
  return isObject(value) && Array.isArray((value as Partial<AccountRecordArchive>).records)
    ? (value as AccountRecordArchive)
    : undefined;
}

// Storage hands back copies, possibly with the keys in another order.
const sortedJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    isObject(item) && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  );

const sameRecord = (a: unknown, b: unknown): boolean => sortedJson(a) === sortedJson(b);

export function reconcileEcdsaAccountRecords<T>(
  stored: Record<string, T>,
  now = Date.now()
): AccountRecordsReconciliation<T> {
  const records = { ...stored };
  const writes: AccountRecordsReconciliation<T>['writes'] = [];

  for (const [key, legacy] of Object.entries(stored)) {
    const keys = ecdsaRecordKeys(legacy);

    if (!keys || key !== keys.legacy) continue;

    const current = stored[keys.current];
    const archive = readArchive(stored[keys.archive]);

    // Anything else under the account's keys is not ours to replace; ui-keyring loads it as before.
    if (current !== undefined && ecdsaRecordKeys(current)?.current !== keys.current) continue;
    if (stored[keys.archive] !== undefined && !archive) continue;

    const archived = archive?.records ?? [];
    const isArchived = archived.some(({ record }) => sameRecord(record, legacy));
    const setAside: ArchivedAccountRecord[] = [];
    let latest = current ?? legacy;

    // Once the old record was set aside, only a 2.x or 3.0.x build run since can have written it again, and that
    // build kept every change there. The record it supersedes is kept as well.
    if (current !== undefined && archive && !isArchived && !sameRecord(current, legacy)) {
      setAside.push({ key: keys.current, record: current, archivedAt: now });
      latest = legacy;
    }

    if (!isArchived) setAside.push({ key: keys.legacy, record: legacy, archivedAt: now });

    const set: Record<string, unknown> = {};

    if (latest !== current) set[keys.current] = latest;
    if (setAside.length) set[keys.archive] = { account: keys.current, records: [...archived, ...setAside] };

    writes.push({ set, remove: [keys.legacy] });
    delete records[keys.legacy];
    records[keys.current] = latest;
  }

  return { records, writes };
}
