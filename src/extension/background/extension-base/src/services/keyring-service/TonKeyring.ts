import * as tonWebMnemonic from 'tonweb-mnemonic';
import CryptoJS from 'crypto-js';
import { type Address, WalletContractV4 } from '@ton/ton';
import { BehaviorSubject } from 'rxjs';
import { stringToU8a, u8aToString } from '@polkadot/util';
import { jsonDecrypt, jsonEncrypt } from '@polkadot/util-crypto';
import { tonStore } from './../../stores/TonStore';
import { validateBip39Mnemonic } from './Bip39';
import { type KeyringService } from '.';
import type { EncryptedJson } from '@polkadot/util-crypto/types';
import type { TonStoreAccount } from '../../stores/TonStore';
import type { FWKeyringMeta } from '../../types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import { WalletEcosystem } from '@/interfaces';

type TonAccountInfo = Omit<TonStoreAccount, 'publicKeyHex'> & {
  walletEcosystem: WalletEcosystem;
  publicKey: Uint8Array;
  walletContract: WalletContractV4;
};

type TonAccount = Record<string, TonAccountInfo>;

export function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex');
}

export function hexToBytes(hex: string) {
  return Uint8Array.from(Buffer.from(hex, 'hex')) as Uint8Array;
}

// How a TON phrase is stored in `cipherSeed`:
// - version 1 (3.0.1-3.0.5): CryptoJS AES with its passphrase key derivation, one MD5 round per block and no
//   authentication, so a copied record allows cheap password guessing. Still read, never written.
// - version 2: the scrypt (N = 2^15, r = 8, p = 1) + xsalsa20-poly1305 JSON that already protects every other account
//   under the same master password, stored as {"version":2,"encoded":...,"encoding":...}.
export const TON_SEED_VERSION = 2;
const TON_RECOVERY_VERSION = 3;

type StoredSeed = EncryptedJson & { version: typeof TON_SEED_VERSION | typeof TON_RECOVERY_VERSION };

function parseStoredSeed(cipherSeed: string): StoredSeed | null {
  if (typeof cipherSeed !== 'string' || cipherSeed.length > 8192) throw new Error('Invalid TON seed format');

  if (!cipherSeed.startsWith('{')) {
    // Only the historical salted OpenSSL format is eligible for legacy reading.
    const bytes = Buffer.from(cipherSeed, 'base64');

    if (
      bytes.toString('base64') !== cipherSeed ||
      bytes.length < 32 ||
      bytes.length % 16 !== 0 ||
      bytes.subarray(0, 8).toString() !== 'Salted__'
    )
      throw new Error('Unsupported TON seed format');

    return null;
  }

  const value = JSON.parse(cipherSeed) as StoredSeed;

  if (
    !value ||
    ![TON_SEED_VERSION, TON_RECOVERY_VERSION].includes(value.version) ||
    value.encoding?.version !== '3' ||
    JSON.stringify(value.encoding.type) !== JSON.stringify(['scrypt', 'xsalsa20-poly1305']) ||
    JSON.stringify(value.encoding.content) !==
      JSON.stringify([value.version === TON_SEED_VERSION ? 'ton-mnemonic' : 'ton-legacy-recovery']) ||
    typeof value.encoded !== 'string'
  ) {
    throw new Error('Unsupported TON seed format');
  }

  const bytes = Buffer.from(value.encoded, 'base64');

  if (bytes.toString('base64') !== value.encoded || bytes.length < 85) throw new Error('Invalid TON seed encoding');

  // The library also checks these parameters. Reject before any expensive work.
  if (bytes.readUInt32LE(32) !== 32768 || bytes.readUInt32LE(36) !== 1 || bytes.readUInt32LE(40) !== 8) {
    throw new Error('Unsupported TON seed KDF');
  }

  return value;
}

export function isLegacyTonSeed(cipherSeed: string) {
  return parseStoredSeed(cipherSeed) === null;
}

export class TonKeyringService {
  readonly accountSubject: BehaviorSubject<SubjectInfo & TonAccount> = new BehaviorSubject({});

  private readonly ready: Promise<void>;
  private storeOperation: Promise<unknown> = Promise.resolve();
  private readonly records = new Map<string, TonStoreAccount>();

  constructor(private keyringService: KeyringService) {
    this.ready = tonStore.readAll().then((accounts) => this.applyAccounts(accounts));
    // Operations still reject on loading errors; never log account contents.
    this.ready.catch(() => undefined);
  }

  withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.storeOperation.then(() => this.ready).then(operation);

    this.storeOperation = next.catch(() => undefined);

    return next;
  }

  // Wallet reset. `removeStoredWallet` deletes the stored records, TON ones included, in one operation; the accounts
  // leave memory only once it has succeeded. Unlike withStoreLock this also runs when the start-up load failed, after
  // that load has settled, so a reset is always possible and a late load cannot bring the accounts back.
  reset(removeStoredWallet: () => Promise<void>): Promise<void> {
    const next = this.storeOperation
      .then(() => this.ready.catch(() => undefined))
      .then(async () => {
        await removeStoredWallet();

        this.records.clear();
        this.accountSubject.next({});
      });

    this.storeOperation = next.catch(() => undefined);

    return next;
  }

  applyAccounts(accounts: TonStoreAccount[]): void {
    accounts.forEach((account) => this.setAccounts(account));
  }

  get hasRecoveryAccounts(): boolean {
    return [...this.records.values()].some(({ cipherSeed }) => {
      try {
        return parseStoredSeed(cipherSeed)?.version === TON_RECOVERY_VERSION;
      } catch {
        return false; // an unknown format is not a recovery record, and must not break unlocking
      }
    });
  }

  setAccounts(record: TonStoreAccount) {
    const { address, name, cipherSeed, publicKeyHex } = record;
    const accounts = this.accountSubject.value;

    const publicKey = hexToBytes(publicKeyHex);
    const walletContract = this.createContractV4(publicKey);

    this.records.set(address, record);

    this.accountSubject.next({
      ...accounts,
      [address]: {
        name,
        address,
        cipherSeed,
        walletContract,
        publicKey,
        walletEcosystem: WalletEcosystem.Ton,
        json: {
          address,
          meta: {
            name,
            cipherSeed,
            walletEcosystem: WalletEcosystem.Ton,
          },
        },
        option: {
          name,
          key: address,
          value: address,
        },
      },
    });
  }

  async updateAccountName(address: string, name: string) {
    return this.withStoreLock(async () => {
      const record = this.records.get(address);

      if (!record) throw new Error('TON account not found');

      const updated = { ...record, name };

      await tonStore.saveMany([updated]);
      this.setAccounts(updated);
    });
  }

  getAccount(_address: string) {
    return this.getAccounts().find(({ address }) => address === _address)!;
  }

  getAccounts() {
    return Object.values(this.accountSubject.value).map(({ json: { address }, name, walletEcosystem }) => ({
      address,
      walletEcosystem,
      meta: {
        name,
        walletEcosystem,
        isMobile: false,
      } as FWKeyringMeta,
    }));
  }

  async generateMnemonic(password?: string, wordsCount = 24) {
    return await tonWebMnemonic.generateMnemonic(wordsCount, password);
  }

  async validateMnemonic(mnemonic: string[], password?: string) {
    return validateBip39Mnemonic(mnemonic) || (await tonWebMnemonic.validateMnemonic(mnemonic, password));
  }

  async mnemonicToKeyPair(mnemonic: string[], password?: string) {
    return await tonWebMnemonic.mnemonicToKeyPair(mnemonic, password);
  }

  async isPasswordNeeded(mnemonic: string[]) {
    return await tonWebMnemonic.isPasswordNeeded(mnemonic);
  }

  async forgetAccount(address: string) {
    return this.withStoreLock(async () => {
      await tonStore.removeAccount(address);
      const accounts = { ...this.accountSubject.value };

      delete accounts[address];
      this.records.delete(address);

      this.accountSubject.next(accounts);
    });
  }

  createContractV4(publicKey: Uint8Array) {
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.from(publicKey) });

    return wallet;
  }

  async createAccount(suri: string, name: string = '', password?: string) {
    const suriArray = suri.split(' ');

    const { publicKey: pubKey } = await this.mnemonicToKeyPair(suriArray);

    const wallet = this.createContractV4(pubKey);
    const address = this.getUserFriendlyAddress(wallet.address);

    if (password) {
      await this.withStoreLock(async () => {
        if (password !== this.keyringService.getPassword()) throw new Error('Wallet session changed');

        const cipherSeed = this.encodeMnemonic(suriArray, password);
        const record = { name, address, cipherSeed, publicKeyHex: bytesToHex(pubKey) };

        await this.verifyRecord(record, password);

        if (password !== this.keyringService.getPassword()) throw new Error('Wallet session changed');

        await tonStore.saveMany([record]);
        this.setAccounts(record);
      });
    }

    return { wallet, address };
  }

  getUserFriendlyAddress(address: Address) {
    return address.toString({
      bounceable: false,
      urlSafe: true,
    });
  }

  encodeMnemonic(mnemonicArray: string[], password: string) {
    // jsonEncrypt keeps the data unencrypted when there is no passphrase; a phrase must never be stored that way.
    if (!password) throw new Error('A password is required to store a TON phrase');

    const { encoded, encoding } = jsonEncrypt(stringToU8a(mnemonicArray.join(' ')), ['ton-mnemonic'], password);

    return JSON.stringify({ version: TON_SEED_VERSION, encoded, encoding });
  }

  decodeMnemonic(cipherMnemonic: string, password: string = this.keyringService.getPassword()) {
    if (!password) throw new Error('Unlock the wallet first');

    const stored = parseStoredSeed(cipherMnemonic);

    if (stored) {
      if (stored.version === TON_RECOVERY_VERSION) throw new Error('This TON account requires its earlier password');

      // Authenticated: a wrong password throws instead of returning other text.
      return u8aToString(jsonDecrypt(stored, password));
    }

    const bytes = CryptoJS.AES.decrypt(cipherMnemonic, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    return decryptedText;
  }

  async decodeAccountMnemonic(address: string, password = this.keyringService.getPassword()): Promise<string> {
    return this.withStoreLock(async () => {
      const record = this.records.get(address);

      if (!record) throw new Error('TON account not found');

      if (parseStoredSeed(record.cipherSeed)?.version !== TON_RECOVERY_VERSION)
        return this.verifyRecord(record, password);

      const masterPassword = this.keyringService.getPassword();
      const legacy = this.readRecoveryRecord(record, masterPassword);
      const mnemonic = await this.verifyRecord(legacy, password);
      const replacement = { ...record, cipherSeed: this.encodeMnemonic(mnemonic.split(' '), masterPassword) };

      await this.verifyRecord(replacement, masterPassword);

      if (masterPassword !== this.keyringService.getPassword()) throw new Error('Wallet session changed');

      await tonStore.saveMany([replacement]);
      this.setAccounts(replacement);

      return mnemonic;
    });
  }

  private protectRecoveryRecord(record: TonStoreAccount, password: string): TonStoreAccount {
    if (!password) throw new Error('Unlock the wallet first');

    // 3.0.5 did not rotate TON passwords. Preserve those unreadable ciphertexts
    // inside strong encryption instead of exposing the old password verifier or
    // blocking access to all the user's other accounts.
    const archive = JSON.stringify({
      address: record.address,
      publicKeyHex: record.publicKeyHex,
      cipherSeed: record.cipherSeed,
    });
    const encrypted = jsonEncrypt(stringToU8a(archive), ['ton-legacy-recovery'], password);
    const replacement = { ...record, cipherSeed: JSON.stringify({ version: TON_RECOVERY_VERSION, ...encrypted }) };
    const recovered = this.readRecoveryRecord(replacement, password);

    if (recovered.cipherSeed !== record.cipherSeed) throw new Error('TON recovery verification failed');

    return replacement;
  }

  private readRecoveryRecord(record: TonStoreAccount, password: string): TonStoreAccount {
    if (!password) throw new Error('Unlock the wallet first');

    const stored = parseStoredSeed(record.cipherSeed);

    if (stored?.version !== TON_RECOVERY_VERSION) throw new Error('Invalid TON recovery record');

    const archive = JSON.parse(u8aToString(jsonDecrypt(stored, password))) as TonStoreAccount;

    if (
      archive.address !== record.address ||
      archive.publicKeyHex !== record.publicKeyHex ||
      !isLegacyTonSeed(archive.cipherSeed)
    )
      throw new Error('Invalid TON recovery record');

    return { ...record, cipherSeed: archive.cipherSeed };
  }

  private async verifyRecord(record: TonStoreAccount, password: string): Promise<string> {
    const mnemonic = this.decodeMnemonic(record.cipherSeed, password);

    // The check is the public key and address stored when the account was added. Phrase validation is not repeated:
    // 3.0.5 stored phrases without it, and every account it stored must keep opening.
    if (!mnemonic) throw new Error('Invalid TON account');

    const keyPair = await this.mnemonicToKeyPair(mnemonic.split(' '));

    try {
      if (
        bytesToHex(keyPair.publicKey) !== record.publicKeyHex ||
        this.getUserFriendlyAddress(this.createContractV4(keyPair.publicKey).address) !== record.address
      ) {
        throw new Error('TON account key mismatch');
      }
    } finally {
      keyPair.secretKey.fill(0);
    }

    return mnemonic;
  }

  async preparePasswordChange(oldPassword: string, newPassword: string): Promise<TonStoreAccount[]> {
    const prepared: TonStoreAccount[] = [];

    for (const record of this.records.values()) {
      if (parseStoredSeed(record.cipherSeed)?.version === TON_RECOVERY_VERSION) {
        prepared.push(this.protectRecoveryRecord(this.readRecoveryRecord(record, oldPassword), newPassword));
        continue;
      }

      const mnemonic = await this.verifyRecord(record, oldPassword);
      const cipherSeed = this.encodeMnemonic(mnemonic.split(' '), newPassword);
      const replacement = { ...record, cipherSeed };

      if ((await this.verifyRecord(replacement, newPassword)) !== mnemonic)
        throw new Error('TON seed verification failed');

      prepared.push(replacement);
    }

    return prepared;
  }

  // The record to store in place of `record` at unlock, or null when it stays as it is. Throws when it cannot be
  // processed; the caller then leaves it unchanged.
  private async migrateRecord(record: TonStoreAccount, password: string): Promise<TonStoreAccount | null> {
    if (parseStoredSeed(record.cipherSeed)?.version === TON_RECOVERY_VERSION) {
      this.readRecoveryRecord(record, password);

      return null;
    }

    let mnemonic: string;

    try {
      mnemonic = await this.verifyRecord(record, password);
    } catch (error) {
      if (!isLegacyTonSeed(record.cipherSeed)) throw error;

      // A 3.0.5 record that the accepted wallet password does not open was left under an earlier password. Keep it,
      // inside strong encryption, for recovery with that password.
      return this.protectRecoveryRecord(record, password);
    }

    if (!isLegacyTonSeed(record.cipherSeed)) return null;

    const cipherSeed = this.encodeMnemonic(mnemonic.split(' '), password);
    const replacement = { ...record, cipherSeed };

    if ((await this.verifyRecord(replacement, password)) !== mnemonic) throw new Error('TON seed verification failed');

    return replacement;
  }

  async migrateOnUnlock(password: string): Promise<void> {
    return this.withStoreLock(async () => {
      const replacements: TonStoreAccount[] = [];

      for (const record of this.records.values()) {
        try {
          const replacement = await this.migrateRecord(record, password);

          if (replacement) replacements.push(replacement);
        } catch {
          // Left exactly as stored, so it opens as before; the others still migrate, and this one is retried at the
          // next unlock.
        }
      }

      // Prepare and verify all accounts before replacing them in one durable batch.
      await tonStore.saveMany(replacements);
      this.applyAccounts(replacements);
    });
  }
}
