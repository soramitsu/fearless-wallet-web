import CryptoJS from 'crypto-js';
import { stringToU8a, u8aConcat, u8aToString } from '@polkadot/util';
import { jsonDecrypt, jsonEncryptFormat, naclEncrypt, scryptEncode, scryptToU8a } from '@polkadot/util-crypto';
import { tonStore } from '../../stores/TonStore';
import KeyringStoreWeb from '../../stores/KeyringStoreWeb';
import { TON_SEED_NEEDS_PREVIOUS_PASSWORD } from './AccountAccessErrors';
import type { EncryptedJson } from '@polkadot/util-crypto/types';
import type { TonStoreAccount } from '../../stores/TonStore';
import { TonKeyringError, verifyTonPhrase } from '@/util/tonKeyring';
import { IS_EXTENSION } from '@/consts/global';

type TonSeedAccount = Pick<TonStoreAccount, 'cipherSeed' | 'pendingCipherSeed'> & { publicKey: Uint8Array };

export interface TonSeedOwner {
  readonly accountSubject: { readonly value: Record<string, TonSeedAccount> };
  setAccounts(record: TonStoreAccount): void;
}

export interface StagedTonSeed {
  address: string;
  cipherSeed: string;
  pendingCipherSeed: string;
}

/** The outcome of recovery with an earlier password (`TonSeedVault.recoverWithPassword`). */
export type TonPasswordRecovery = 'recovered' | 'wrong_password' | 'previous_password_required';

type StoredCiphers = Pick<TonStoreAccount, 'cipherSeed' | 'pendingCipherSeed'>;

// How a TON phrase is stored in `cipherSeed` (and in `pendingCipherSeed`):
// - version 1, written by 3.0.1-3.0.5: CryptoJS AES text. Its key derivation is one MD5 round and it has no integrity
//   check, so a copied record allows cheap password guessing. Read, never written; the check after unlock replaces it.
// - version 2, written by 3.0.6 and this version: {"version":2,"encoded","encoding"}, the scrypt (N = 2^15, r = 8,
//   p = 1) and xsalsa20-poly1305 JSON that protects every other account under the same master password.
// - version 3, written by 3.0.6 and this version: a version 1 record the master password does not open, kept for
//   recovery with the earlier password it was stored with. The same JSON as version 2, under the master password,
//   around {"address","publicKeyHex","cipherSeed"}.
// Versions 2 and 3 are exactly what 3.0.6 reads and writes, so a rollback to it keeps every TON account.
const TON_SEED_VERSION = 2;
const TON_RECOVERY_VERSION = 3;
const TON_SEED_CONTENT: Record<number, string> = {
  [TON_SEED_VERSION]: 'ton-mnemonic',
  [TON_RECOVERY_VERSION]: 'ton-legacy-recovery',
};
// 3.0.6 opens no other cost. Passed explicitly: the library default is N = 2^17 wherever the build's rewrite
// (scripts/keystore-scrypt-params.mjs) does not reach, for example in unit tests.
const TON_SEED_SCRYPT = { N: 1 << 15, p: 1, r: 8 };

type StoredTonSeed = EncryptedJson & { version: typeof TON_SEED_VERSION | typeof TON_RECOVERY_VERSION };
type TonRecoveryOwner = { address?: string; publicKey: Uint8Array };

// Versions 2 and 3, or null for text that is not JSON (version 1). Throws for any other JSON, including other scrypt
// parameters, before the expensive part; the same checks as 3.0.6.
function parseTonSeed(cipherSeed: string): StoredTonSeed | null {
  if (cipherSeed.length > 8192) throw new Error('Invalid TON seed format');
  if (!cipherSeed.startsWith('{')) return null;

  const value = JSON.parse(cipherSeed) as StoredTonSeed;

  if (
    !value ||
    (value.version !== TON_SEED_VERSION && value.version !== TON_RECOVERY_VERSION) ||
    value.encoding?.version !== '3' ||
    JSON.stringify(value.encoding.type) !== JSON.stringify(['scrypt', 'xsalsa20-poly1305']) ||
    JSON.stringify(value.encoding.content) !== JSON.stringify([TON_SEED_CONTENT[value.version]]) ||
    typeof value.encoded !== 'string'
  )
    throw new Error('Unsupported TON seed format');

  const bytes = Buffer.from(value.encoded, 'base64');

  if (bytes.toString('base64') !== value.encoded || bytes.length < 85) throw new Error('Invalid TON seed encoding');
  if (
    bytes.readUInt32LE(32) !== TON_SEED_SCRYPT.N ||
    bytes.readUInt32LE(36) !== TON_SEED_SCRYPT.p ||
    bytes.readUInt32LE(40) !== TON_SEED_SCRYPT.r
  )
    throw new Error('Unsupported TON seed KDF');

  return value;
}

function tonSeedVersion(cipherSeed: string): number | undefined {
  try {
    return parseTonSeed(cipherSeed)?.version ?? 1;
  } catch {
    return undefined;
  }
}

/** The salted OpenSSL text CryptoJS writes: version 1 as 3.0.6 accepts it inside a version 3 record. */
export function isLegacyTonSeed(cipherSeed: string | undefined): boolean {
  if (typeof cipherSeed !== 'string' || cipherSeed.length > 8192 || cipherSeed.startsWith('{')) return false;

  const bytes = Buffer.from(cipherSeed, 'base64');

  return (
    bytes.toString('base64') === cipherSeed &&
    bytes.length >= 32 &&
    bytes.length % 16 === 0 &&
    bytes.subarray(0, 8).toString() === 'Salted__'
  );
}

function encryptTonJson(data: Uint8Array, version: StoredTonSeed['version'], password: string): string {
  // Without a password jsonEncrypt would keep the data in the clear; a TON phrase is never stored that way.
  if (!password) throw new Error('A password is required to store a TON phrase');

  const { params, password: key, salt } = scryptEncode(password, undefined, TON_SEED_SCRYPT);
  const { encrypted, nonce } = naclEncrypt(data, key.subarray(0, 32));
  const { encoded, encoding } = jsonEncryptFormat(
    u8aConcat(scryptToU8a(salt, params), nonce, encrypted),
    [TON_SEED_CONTENT[version]],
    true
  );

  return JSON.stringify({ version, encoded, encoding });
}

/** Version 2 of `seed` under `password`. */
export function encryptTonSeed(seed: string, password: string): string {
  return encryptTonJson(stringToU8a(seed), TON_SEED_VERSION, password);
}

// The version 1 text a version 3 record keeps, once `password` opens the record and it belongs to this account.
function openTonRecovery(stored: StoredTonSeed, password: string, owner: TonRecoveryOwner): string | undefined {
  try {
    const archive = JSON.parse(u8aToString(jsonDecrypt(stored, password))) as Partial<TonStoreAccount>;

    if (
      archive?.publicKeyHex !== Buffer.from(owner.publicKey).toString('hex') ||
      (owner.address !== undefined && archive.address !== owner.address) ||
      !isLegacyTonSeed(archive.cipherSeed)
    )
      return undefined;

    return archive.cipherSeed;
  } catch {
    return undefined;
  }
}

/** For a version 3 record: the version 1 text it keeps for recovery, when `password` opens it and it is this
 * account's. Undefined for anything else; never throws. */
export function readTonRecoveryRecord(
  cipherSeed: string | undefined,
  password: string,
  owner: TonRecoveryOwner
): string | undefined {
  if (!cipherSeed || !password) return undefined;

  let stored: StoredTonSeed | null;

  try {
    stored = parseTonSeed(cipherSeed);
  } catch {
    return undefined;
  }

  return stored?.version === TON_RECOVERY_VERSION ? openTonRecovery(stored, password, owner) : undefined;
}

/** A version 3 record keeping `legacy` (this account's version 1 text) for recovery, under `password`. It is read
 * back before it is returned. */
export function protectTonRecoveryRecord(
  legacy: string,
  password: string,
  owner: Required<TonRecoveryOwner>
): string {
  if (!isLegacyTonSeed(legacy)) throw new TonKeyringError('ton_seed_reencryption_unverified');

  const archive = JSON.stringify({
    address: owner.address,
    publicKeyHex: Buffer.from(owner.publicKey).toString('hex'),
    cipherSeed: legacy,
  });
  const cipherSeed = encryptTonJson(stringToU8a(archive), TON_RECOVERY_VERSION, password);

  if (readTonRecoveryRecord(cipherSeed, password, owner) !== legacy) {
    throw new TonKeyringError('ton_seed_reencryption_unverified');
  }

  return cipherSeed;
}

// The text `password` opens, not yet checked against the account. Throws for a format this wallet does not write
// and, for versions 2 and 3, which are authenticated, for a wrong password. Version 3 opens here only when its phrase
// was stored with this same password; otherwise it waits for that earlier one (TonSeedVault.recoverWithPassword).
function openTonSeed(cipherSeed: string, password: string, publicKey: Uint8Array): string {
  const stored = parseTonSeed(cipherSeed);

  if (stored?.version === TON_SEED_VERSION) return u8aToString(jsonDecrypt(stored, password));

  const legacy = stored ? openTonRecovery(stored, password, { publicKey }) : cipherSeed;

  if (legacy === undefined) throw new Error('TON recovery record does not open');

  return CryptoJS.AES.decrypt(legacy, password).toString(CryptoJS.enc.Utf8);
}

// Version 1 has no integrity check: a wrong password throws 'Malformed UTF-8 data', returns '' or
// returns garbage, so a phrase only counts as decrypted once it derives the account's public key.
export async function decryptTonSeed(
  cipherSeed: string | undefined,
  password: string,
  publicKey: Uint8Array
): Promise<string | undefined> {
  if (!cipherSeed || !password) return undefined;

  let seed: string;

  try {
    seed = openTonSeed(cipherSeed, password, publicKey);
  } catch {
    return undefined;
  }

  return seed && (await derivesPublicKey(seed, publicKey)) ? seed : undefined;
}

// The words are replayed exactly as given; any failure to derive counts as "not this account".
async function derivesPublicKey(phrase: string, publicKey: Uint8Array): Promise<boolean> {
  try {
    return await verifyTonPhrase(phrase.split(' '), publicKey);
  } catch {
    return false;
  }
}

// Tries the exact words first: 3.0.x hashed words.join(' '), so spacing and case can be part of the key.
function phraseCandidates(phrase: string): string[] {
  const collapsed = phrase.trim().replace(/\s+/g, ' ');

  return [...new Set([phrase, collapsed, collapsed.toLowerCase()])].filter(Boolean);
}

/** Opens, re-encrypts and repairs the encrypted TON phrases in `fw:ton:<address>`. Every write keeps
 * the rest of the stored record, and no ciphertext is replaced before its phrase was verified
 * against the account's public key. */
export class TonSeedVault {
  /** TON accounts whose phrase does not open with the current master password. */
  readonly needsPreviousPassword = new Set<string>();

  private work: Promise<unknown> = Promise.resolve();

  constructor(private readonly owner: TonSeedOwner) {}

  // One vault operation at a time: a promotion or cleanup never interleaves with a password change.
  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.work.catch(() => {}).then(operation);

    this.work = result.catch(() => {});

    return result;
  }

  /** Import shares the password-change queue. The durable record owns an existing address; a new
   * record is published only after its verified seed has been stored under the current password. */
  importAccount(
    record: Omit<TonStoreAccount, 'cipherSeed' | 'pendingCipherSeed'>,
    phrase: string,
    password: () => string
  ): Promise<void> {
    return this.exclusive(async () => {
      const currentPassword = password();

      if (!currentPassword) throw new TonKeyringError('keyring_locked');

      const { address, publicKeyHex } = record;
      const existing = await tonStore.getAndWait(address);

      if (existing) {
        if (existing.publicKeyHex?.toLowerCase() !== publicKeyHex.toLowerCase()) {
          throw new TonKeyringError('account_key_mismatch');
        }

        this.owner.setAccounts({ ...existing, address });
        try {
          await this.open(address, currentPassword, () => password() === currentPassword);
        } catch (error) {
          if (!(error instanceof TonKeyringError) || error.code !== TON_SEED_NEEDS_PREVIOUS_PASSWORD) throw error;
          if (!(await derivesPublicKey(phrase, this.account(address).publicKey))) {
            throw new TonKeyringError('account_key_mismatch');
          }
          await this.storeRecovered(address, phrase, password);
        }

        if (!password()) throw new TonKeyringError('keyring_locked');

        return;
      }

      const cipherSeed = await this.encryptVerified(phrase, currentPassword, Buffer.from(publicKeyHex, 'hex'));

      if (password() !== currentPassword) throw new TonKeyringError('keyring_locked');

      await tonStore.updateAndWait(
        address,
        (current) => {
          if (password() !== currentPassword) throw new TonKeyringError('keyring_locked');
          // A record arriving from outside this vault must never be overwritten by an import.
          if (current) throw new TonKeyringError('account_changed');

          return { ...record, cipherSeed };
        },
        (committed) => this.owner.setAccounts({ ...committed, address }),
        false // This awaited import owns its error; a later password flush must not replay it.
      );

      // The write may finish after lock. Keep that encrypted record, but do not let the caller
      // report success or change selection until the user unlocks and explicitly retries.
      if (password() !== currentPassword) throw new TonKeyringError('keyring_locked');
    });
  }

  /** Returns the stored phrase exactly as stored. The password is read once this operation runs, after
   * any password change ahead of it. A cancelled scan (`isCurrent`) neither repairs nor flags. With
   * `upgrade`, for the check after unlock, a 3.0.x ciphertext is also moved to version 2 or 3 (`open`). */
  decryptVerified(
    address: string,
    password: () => string,
    isCurrent: () => boolean = () => true,
    upgrade = false
  ): Promise<string> {
    return this.exclusive(async () => {
      const currentPassword = password();

      if (!currentPassword) throw new TonKeyringError('keyring_locked');

      return this.open(address, currentPassword, isCurrent, upgrade);
    });
  }

  /** Before a password change: stores a copy of every phrase that opens with `oldPassword`, encrypted
   * with `newPassword`, next to the current ciphertext. Phrases that already need an earlier password
   * are left as they are and do not block the change. Call inside `exclusive`. */
  async stage(oldPassword: string, newPassword: string): Promise<StagedTonSeed[]> {
    const staged: StagedTonSeed[] = [];

    try {
      for (const address of Object.keys(this.owner.accountSubject.value)) {
        const account = this.account(address);
        let { cipherSeed } = account;
        let seed = await decryptTonSeed(cipherSeed, oldPassword, account.publicKey);

        if (seed === undefined) {
          seed = await decryptTonSeed(account.pendingCipherSeed, oldPassword, account.publicKey);
          if (seed === undefined) {
            this.needsPreviousPassword.add(address);
            continue;
          }
          // An interrupted earlier change left the only current copy in the pending slot. Promote it
          // before that slot is reused, or the copy the old password opens would be overwritten.
          if (!(await this.replace(address, account, account.pendingCipherSeed!, true))) continue;
          cipherSeed = account.pendingCipherSeed!;
        }

        const pendingCipherSeed = await this.encryptVerified(seed, newPassword, account.publicKey);
        const saved = await tonStore.updateAndWait(
          address,
          (current) => (current?.cipherSeed === cipherSeed ? { ...current, pendingCipherSeed } : undefined),
          (record) => this.owner.setAccounts({ ...record, address })
        );

        if (saved) staged.push({ address, cipherSeed, pendingCipherSeed });
      }
    } catch (error) {
      await this.rollback(staged);

      throw error;
    }

    return staged;
  }

  /** After a failed password change: removes the copies `stage` wrote. Call inside `exclusive`. */
  async rollback(staged: StagedTonSeed[]): Promise<void> {
    for (const { address, cipherSeed, pendingCipherSeed } of staged) {
      // A copy left behind is harmless: the next open keeps the ciphertext the current password opens.
      await this.replace(address, { cipherSeed, pendingCipherSeed }, cipherSeed, false).catch(() => false);
    }
  }

  /** After the new master password is in place: the staged copies become the current ciphertexts.
   * A commit that does not land is finished by the next open. Call inside `exclusive`. */
  async commit(staged: StagedTonSeed[]): Promise<void> {
    for (const { address, cipherSeed, pendingCipherSeed } of staged) {
      await this.replace(address, { cipherSeed, pendingCipherSeed }, pendingCipherSeed, false).catch(() => false);
    }
  }

  /** Re-encrypts with the current master password a phrase that opens with a password used before. A phrase
   * kept in version 3 also needs the master password that record was stored under: the current one, or after
   * a reset or a restored wallet an earlier one. When `previousPassword` opens only that outer layer, the record
   * moves under the current master password and still waits for the password its phrase was stored with
   * ('previous_password_required'). A wrong password writes nothing. */
  recoverWithPassword(
    address: string,
    previousPassword: string,
    currentPassword: () => string
  ): Promise<TonPasswordRecovery> {
    return this.exclusive(async () => {
      const account = this.account(address);
      const { cipherSeed, pendingCipherSeed, publicKey } = account;
      const password = currentPassword();

      if (!password) throw new TonKeyringError('keyring_locked');

      for (const stored of [cipherSeed, pendingCipherSeed]) {
        const legacy = readTonRecoveryRecord(stored, password, { address, publicKey });
        const seed =
          (await decryptTonSeed(stored, previousPassword, publicKey)) ??
          (await decryptTonSeed(legacy, previousPassword, publicKey));

        if (seed === undefined) continue;

        await this.storeRecovered(address, seed, currentPassword);

        return 'recovered';
      }

      // The current master password opening the outer layer is not progress: the record is already under it.
      const legacy =
        previousPassword === password ? undefined : readTonRecoveryRecord(cipherSeed, previousPassword, { address, publicKey });

      if (legacy === undefined) return 'wrong_password';

      const replacement = protectTonRecoveryRecord(legacy, password, { address, publicKey });
      const saved = await tonStore.updateAndWait(
        address,
        (current) =>
          current?.cipherSeed === cipherSeed && current.pendingCipherSeed === pendingCipherSeed
            ? { ...current, cipherSeed: replacement }
            : undefined,
        (record) => this.owner.setAccounts({ ...record, address }),
        false // Recovery awaits and reports this write directly.
      );

      if (!saved) throw new TonKeyringError('not_found');

      return 'previous_password_required';
    });
  }

  /** Re-encrypts with the current master password the phrase the user typed, once it derives the
   * stored public key. */
  recoverWithPhrase(address: string, phrase: string, currentPassword: () => string): Promise<boolean> {
    return this.exclusive(async () => {
      const { publicKey } = this.account(address);

      for (const candidate of phraseCandidates(phrase)) {
        if (!(await derivesPublicKey(candidate, publicKey))) continue;

        await this.storeRecovered(address, candidate, currentPassword);

        return true;
      }

      return false;
    });
  }

  private account(address: string): TonSeedAccount {
    const account = this.owner.accountSubject.value[address];

    if (!account) throw new TonKeyringError('not_found');

    return account;
  }

  // Tries the current ciphertext, then a copy staged by an interrupted password change. The one that
  // opens with this password becomes the only copy; the other holds the same phrase under another password.
  // With `upgrade` (the master password, after unlock) the copy kept is version 2, and a 3.0.x ciphertext that
  // does not open is kept for recovery inside version 3, as 3.0.6 does. Like every repair here these are
  // optional: one that fails changes nothing, and the next unlock tries again.
  private async open(address: string, password: string, isCurrent: () => boolean, upgrade = false): Promise<string> {
    const account = this.account(address);
    const { cipherSeed, pendingCipherSeed, publicKey } = account;
    const writable = IS_EXTENSION || !KeyringStoreWeb.readOnly;

    for (const opened of [cipherSeed, pendingCipherSeed]) {
      const seed = await decryptTonSeed(opened, password, publicKey);

      if (seed === undefined) continue;

      if (isCurrent()) {
        const kept = upgrade && writable ? await this.upgraded(opened!, seed, password, publicKey) : opened!;

        if (writable && (kept !== cipherSeed || pendingCipherSeed))
          await this.replace(address, account, kept, false).catch(() => false);
        this.needsPreviousPassword.delete(address);
      }

      return seed;
    }

    if (isCurrent()) {
      this.needsPreviousPassword.add(address);
      // `replace` drops a pending copy, which may be the one an earlier password opens: such a record stays as it is.
      if (upgrade && writable && !pendingCipherSeed && isLegacyTonSeed(cipherSeed))
        await this.protect(address, account, password).catch(() => false);
    }

    throw new TonKeyringError(TON_SEED_NEEDS_PREVIOUS_PASSWORD);
  }

  // The ciphertext to keep for the phrase `opened` held: `opened` itself once it is version 2, else a verified
  // version 2 copy, or `opened` again when that copy cannot be made.
  private async upgraded(opened: string, seed: string, password: string, publicKey: Uint8Array): Promise<string> {
    if (tonSeedVersion(opened) === TON_SEED_VERSION) return opened;

    try {
      return await this.encryptVerified(seed, password, publicKey);
    } catch {
      return opened;
    }
  }

  // Keeps a 3.0.x ciphertext that the master password does not open inside version 3 under that password, so a
  // copy of storage no longer allows cheap guessing of the earlier password; recovery with it still works.
  private async protect(address: string, account: TonSeedAccount, password: string): Promise<boolean> {
    const cipherSeed = protectTonRecoveryRecord(account.cipherSeed, password, { address, publicKey: account.publicKey });

    return this.replace(address, account, cipherSeed, false);
  }

  private async encryptVerified(seed: string, password: string, publicKey: Uint8Array): Promise<string> {
    const cipherSeed = encryptTonSeed(seed, password);

    if ((await decryptTonSeed(cipherSeed, password, publicKey)) !== seed) {
      throw new TonKeyringError('ton_seed_reencryption_unverified');
    }

    return cipherSeed;
  }

  // Sets `cipherSeed` and drops the pending copy, only while the stored ciphertexts are still the ones
  // this decision was made on. Repairs are optional (`trackFailure = false`): a failed one never fails a
  // transfer or export whose phrase already opened.
  private async replace(address: string, expected: StoredCiphers, cipherSeed: string, trackFailure: boolean): Promise<boolean> {
    const saved = await tonStore.updateAndWait(
      address,
      (current) => {
        if (!current || current.cipherSeed !== expected.cipherSeed || current.pendingCipherSeed !== expected.pendingCipherSeed) {
          return undefined;
        }

        const { pendingCipherSeed: _replaced, ...record } = current;

        return { ...record, cipherSeed };
      },
      (record) => this.owner.setAccounts({ ...record, address }),
      trackFailure
    );

    return saved !== undefined;
  }

  private async storeRecovered(address: string, seed: string, currentPassword: () => string): Promise<void> {
    const password = currentPassword();

    if (!password) throw new TonKeyringError('keyring_locked');

    const { publicKey } = this.account(address);
    const cipherSeed = await this.encryptVerified(seed, password, publicKey);
    const publicKeyHex = Buffer.from(publicKey).toString('hex');
    const saved = await tonStore.updateAndWait(
      address,
      (current) => {
        if (current?.publicKeyHex?.toLowerCase() !== publicKeyHex) return undefined;

        const { pendingCipherSeed: _replaced, ...record } = current;

        return { ...record, cipherSeed };
      },
      (record) => this.owner.setAccounts({ ...record, address }),
      false // Recovery awaits and reports this write directly.
    );

    if (!saved) throw new TonKeyringError('not_found');

    this.needsPreviousPassword.delete(address);
  }
}
