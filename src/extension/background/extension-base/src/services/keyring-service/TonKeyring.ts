import * as tonWebMnemonic from 'tonweb-mnemonic';
import CryptoJS from 'crypto-js';
import { BehaviorSubject } from 'rxjs';
import { u8aToString } from '@polkadot/util';
import { jsonDecrypt } from '@polkadot/util-crypto';
import { tonStore } from './../../stores/TonStore';
import { validateBip39Mnemonic } from './Bip39';
import { TonSeedVault, encryptTonSeed, protectTonRecoveryRecord } from './TonSeedVault';
import { TON_RECOVERY_VERSION, parseStoredSeed, isLegacyTonSeed } from './TonSeedEncoding';
import { type KeyringService } from '.';
export { TON_SEED_VERSION, isLegacyTonSeed } from './TonSeedEncoding';
import type { Address, WalletContractV4 } from '@ton/ton';
import type { TonStoreAccount } from '../../stores/TonStore';
import type { FWKeyringMeta } from '../../types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import { WalletEcosystem } from '@/interfaces';
import { createTonWalletContractV4R2, deriveCompatibleTonKeyPair, deriveTonImportChoice, type TonImportChoice, type TonImportDerivation } from '@/util/tonKeyring';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

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

export class TonKeyringService {
  readonly accountSubject: BehaviorSubject<SubjectInfo & TonAccount> = new BehaviorSubject({});
  readonly vault = new TonSeedVault(this);

  private ready: Promise<void>;
  private loaded = false;
  private migrationIssue = false;
  private storeOperation: Promise<unknown> = Promise.resolve();
  private readonly records = new Map<string, TonStoreAccount>();

  constructor(private keyringService: KeyringService) {
    this.ready = this.loadAccounts();
    tonStore.loaded = this.ready;
    // Operations still reject on loading errors; never log account contents.
    this.ready.catch(() => undefined);
  }

  loadAll(): Promise<void> {
    this.ready = this.loadAccounts();
    return this.ready;
  }

  private async loadAccounts(): Promise<void> {
    const accounts = await tonStore.readAll();
    this.records.clear();
    this.accountSubject.next({});
    this.applyAccounts(accounts);
    this.loaded = true;
  }

  get hasStorageIssues(): boolean {
    return this.migrationIssue || !!tonStore.hasUnreadableRecords;
  }

  withStoreLock<T>(operation: () => Promise<T>, requireTonAccounts = true): Promise<T> {
    const next = this.vault.exclusive(async () => {
      if (requireTonAccounts) {
        try { await this.ready; } catch {
          // A failed startup read is retryable, and never poisons unrelated
          // Substrate metadata operations sharing the serialization gate.
          if (!this.loaded) this.ready = this.loadAccounts();
          await this.ready;
        }
      }
      return operation();
    });
    this.storeOperation = next.catch(() => undefined);
    return next;
  }

  // Reset remains available when startup loading failed. Wait for any pending
  // load and earlier TON mutation before removal, then discard memory only
  // after storage confirms that the complete wallet was removed.
  reset(removeStoredWallet: () => Promise<void>): Promise<void> {
    const next = this.vault.exclusive(async () => {
      await this.ready.catch(() => undefined);
      await removeStoredWallet();
      this.records.clear();
      this.accountSubject.next({});
      this.migrationIssue = false;
      this.loaded = true;
      this.ready = Promise.resolve();
      tonStore.hasUnreadableRecords = false;
    });
    this.storeOperation = next.catch(() => undefined);
    return next;
  }

  applyAccounts(accounts: TonStoreAccount[]): void {
    accounts.forEach((account) => this.setAccounts(account));
  }

  get hasRecoveryAccounts(): boolean {
    return [...this.records.values()].some(({ cipherSeed }) => {
      try { return parseStoredSeed(cipherSeed)?.version === TON_RECOVERY_VERSION; } catch { return false; }
    });
  }

  setAccounts(record: TonStoreAccount) {
    const { address, name, cipherSeed, pendingCipherSeed, publicKeyHex, meta } = record;
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
        pendingCipherSeed,
        walletContract,
        publicKey,
        walletEcosystem: WalletEcosystem.Ton,
        json: {
          address,
          meta: meta ?? { name, walletEcosystem: WalletEcosystem.Ton },
        },
        option: {
          name,
          key: address,
          value: address,
        },
      },
    });
  }

  // Only the name changes: the stored record keeps its ciphertexts and any field this version does not know.
  async updateAccountName(address: string, name: string): Promise<void> {
    return this.vault.exclusive(async () => {
    const {
      json: { meta },
    } = this.accountSubject.value[address];
    const nextMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...meta,
        name,
        walletEcosystem: WalletEcosystem.Ton,
      },
      WalletEcosystem.Ton
    );

    await tonStore.updateAndWait(
      address,
      (current) => (current ? { ...current, name, meta: nextMeta } : undefined),
      (record) => this.setAccounts({ ...record, address })
    );
    });
  }

  getAccount(_address: string) {
    return this.getAccounts().find(({ address }) => address === _address)!;
  }

  getAccounts() {
    return Object.values(this.accountSubject.value).map(({ json: { address, meta }, name, walletEcosystem }) => ({
      address,
      walletEcosystem,
      meta: {
        name,
        walletEcosystem,
        isMobile: false,
        walletSecurityGeneration: meta.walletSecurityGeneration,
      } as FWKeyringMeta,
    }));
  }

  async generateMnemonic(password?: string, wordsCount = 24) {
    return await tonWebMnemonic.generateMnemonic(wordsCount, password);
  }

  async validateMnemonic(mnemonic: string[], password?: string) {
    return validateBip39Mnemonic(mnemonic) || (await tonWebMnemonic.validateMnemonic(mnemonic, password));
  }

  async mnemonicToKeyPair(mnemonic: string[], password?: string, expectedPublicKey?: Uint8Array) {
    return deriveCompatibleTonKeyPair(mnemonic, expectedPublicKey, password);
  }

  async isPasswordNeeded(mnemonic: string[]) {
    return await tonWebMnemonic.isPasswordNeeded(mnemonic);
  }

  forgetAccount(address: string): Promise<void> {
    return this.keyringService.forgetAccount(address);
  }

  removeAccountFromMemory(address: string): void {
    const accounts = { ...this.accountSubject.value };
    delete accounts[address];
    this.records.delete(address);
    this.accountSubject.next(accounts);
    this.vault.needsPreviousPassword.delete(address);
  }

  createContractV4(publicKey: Uint8Array) {
    const wallet = createTonWalletContractV4R2(publicKey);

    return wallet;
  }

  async createAccount(suri: string, meta: FWKeyringMeta | string = '', choiceOrPassword?: TonImportChoice | string) {
    const choice = typeof choiceOrPassword === 'object' ? choiceOrPassword : undefined;
    const chosen = choice && (await deriveTonImportChoice(suri, choice));
    const account = chosen || (await deriveCompatibleTonKeyPair(suri.split(' ')));
    const suriArray = (chosen ? chosen.phrase : suri).split(' ');
    const providedMeta: FWKeyringMeta =
      typeof meta === 'string'
        ? {
            name: meta,
            walletEcosystem: WalletEcosystem.Ton,
          }
        : {
            ...meta,
            walletEcosystem: WalletEcosystem.Ton,
          };
    const initialMeta = this.keyringService.getAccountCreationMeta(suri, providedMeta);
    try {
    const tonDerivation: TonImportDerivation = choice?.derivation ?? (validateBip39Mnemonic(suriArray) ? 'universal' : 'native');
    const wallet = this.createContractV4(account.publicKey);
    const address = this.getUserFriendlyAddress(wallet.address);
    const publicKeyHex = bytesToHex(account.publicKey);

    const name = initialMeta.name ?? '';
    const universalMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...initialMeta,
        tonAddress: address,
        tonPublicKeyHex: publicKeyHex,
        tonDerivation,
      },
      WalletEcosystem.Ton
    );

    // Only the universal key comes from a derivation path, so no path is recorded for the others.
    if (tonDerivation !== 'universal') {
      universalMeta.universalWallet.publicAccounts = universalMeta.universalWallet.publicAccounts.map((publicAccount) => {
        if (publicAccount.ecosystem !== WalletEcosystem.Ton || publicAccount.address !== address) return publicAccount;

        const { derivationPath: _universalPath, ...withoutPath } = publicAccount;

        return withoutPath;
      });
    }

    await this.vault.importAccount(
      { address, name, meta: universalMeta, publicKeyHex },
      suriArray.join(' '),
      () => this.keyringService.getPassword()
    );

    return { wallet, address };
    } finally { account.secretKey.fill(0); }
  }

  getUserFriendlyAddress(address: Address) {
    return address.toString({
      bounceable: false,
      urlSafe: true,
    });
  }

  encodeMnemonic(mnemonicArray: string[], password: string) {
    return encryptTonSeed(mnemonicArray.join(' '), password);
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

  decodeMnemonicVerified(address: string): Promise<string> {
    return this.vault.decryptVerified(address, () => this.keyringService.getPassword());
  }

  readRecoveryCipher(address: string, password: string): string {
    const record = this.records.get(address);
    if (!record) throw new Error('TON account not found');
    return this.readRecoveryRecord(record, password).cipherSeed;
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
    const cipherSeed = protectTonRecoveryRecord(record.cipherSeed, password, {
      address: record.address, publicKey: hexToBytes(record.publicKeyHex),
    });
    const replacement = { ...record, cipherSeed };
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

    // Older releases persisted phrases without validating their shape. The
    // stored public key and address remain the authority for those accounts.
    if (!mnemonic) throw new Error('Invalid TON account');

    const keyPair = await this.mnemonicToKeyPair(mnemonic.split(' '), undefined, hexToBytes(record.publicKeyHex));

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
    if (tonStore.hasUnreadableRecords) throw new Error('Some TON accounts could not be loaded; reopen the wallet and retry');
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
      return this.protectRecoveryRecord(record, password);
    }
    if (!isLegacyTonSeed(record.cipherSeed)) return null;
    const replacement = { ...record, cipherSeed: this.encodeMnemonic(mnemonic.split(' '), password) };
    if ((await this.verifyRecord(replacement, password)) !== mnemonic) throw new Error('TON seed verification failed');
    return replacement;
  }

  async migrateOnUnlock(password: string): Promise<void> {
    return this.withStoreLock(async () => {
      if (this.hasStorageIssues) await this.loadAccounts();
      const replacements: TonStoreAccount[] = [];
      this.migrationIssue = false;
      for (const record of this.records.values()) {
        try {
          const replacement = await this.migrateRecord(record, password);
          if (replacement) replacements.push(replacement);
        } catch {
          // Preserve an unreadable record byte-for-byte, and disclose the issue
          // after unlock while other accounts remain available for recovery.
          this.migrationIssue = true;
        }
      }
      if (replacements.length) await tonStore.saveMany(replacements);
      this.applyAccounts(replacements);
    });
  }
}
