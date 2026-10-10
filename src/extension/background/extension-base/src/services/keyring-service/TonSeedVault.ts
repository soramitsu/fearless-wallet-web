import CryptoJS from 'crypto-js';
import { tonStore } from '../../stores/TonStore';
import { TON_SEED_NEEDS_PREVIOUS_PASSWORD } from './AccountAccessErrors';
import type { TonStoreAccount } from '../../stores/TonStore';
import { TonKeyringError, verifyTonPhrase } from '@/util/tonKeyring';

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

type StoredCiphers = Pick<TonStoreAccount, 'cipherSeed' | 'pendingCipherSeed'>;

export function encryptTonSeed(seed: string, password: string): string {
  return CryptoJS.AES.encrypt(seed, password).toString();
}

// CryptoJS has no integrity check. A wrong password throws 'Malformed UTF-8 data', returns '' or
// returns garbage, so a phrase only counts as decrypted once it derives the account's public key.
export async function decryptTonSeed(
  cipherSeed: string | undefined,
  password: string,
  publicKey: Uint8Array
): Promise<string | undefined> {
  if (!cipherSeed || !password) return undefined;

  let seed: string;

  try {
    seed = CryptoJS.AES.decrypt(cipherSeed, password).toString(CryptoJS.enc.Utf8);
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

  /** Returns the stored phrase exactly as stored. The password is read once this operation runs, after
   * any password change ahead of it. A cancelled scan (`isCurrent`) neither repairs nor flags. */
  decryptVerified(address: string, password: () => string, isCurrent: () => boolean = () => true): Promise<string> {
    return this.exclusive(async () => {
      const currentPassword = password();

      if (!currentPassword) throw new TonKeyringError('keyring_locked');

      return this.open(address, currentPassword, isCurrent);
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

  /** Re-encrypts with the current master password a phrase that opens with a password used before. */
  recoverWithPassword(address: string, previousPassword: string, currentPassword: () => string): Promise<boolean> {
    return this.exclusive(async () => {
      const { cipherSeed, pendingCipherSeed, publicKey } = this.account(address);
      const seed =
        (await decryptTonSeed(cipherSeed, previousPassword, publicKey)) ??
        (await decryptTonSeed(pendingCipherSeed, previousPassword, publicKey));

      if (seed === undefined) return false;

      await this.storeRecovered(address, seed, currentPassword);

      return true;
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
  private async open(address: string, password: string, isCurrent: () => boolean): Promise<string> {
    const account = this.account(address);
    const { cipherSeed, pendingCipherSeed, publicKey } = account;
    const current = await decryptTonSeed(cipherSeed, password, publicKey);

    if (current !== undefined) {
      if (isCurrent()) {
        if (pendingCipherSeed) await this.replace(address, account, cipherSeed, false).catch(() => false);
        this.needsPreviousPassword.delete(address);
      }

      return current;
    }

    const pending = await decryptTonSeed(pendingCipherSeed, password, publicKey);

    if (pending !== undefined) {
      if (isCurrent()) {
        await this.replace(address, account, pendingCipherSeed!, false).catch(() => false);
        this.needsPreviousPassword.delete(address);
      }

      return pending;
    }

    if (isCurrent()) this.needsPreviousPassword.add(address);

    throw new TonKeyringError(TON_SEED_NEEDS_PREVIOUS_PASSWORD);
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
      (record) => this.owner.setAccounts({ ...record, address })
    );

    if (!saved) throw new TonKeyringError('not_found');

    this.needsPreviousPassword.delete(address);
  }
}
