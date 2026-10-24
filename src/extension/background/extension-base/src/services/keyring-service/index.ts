import {
  isEthereumAddress,
  base64Decode,
  mnemonicToMiniSecret,
  mnemonicGenerate,
  mnemonicValidate,
  sr25519PairFromSeed,
} from '@polkadot/util-crypto';
import { accounts as accountsObservable } from '@subwallet/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@subwallet/ui-keyring/observable/addresses';
import { BehaviorSubject } from 'rxjs';
import CurrentAccountStore, { type CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { keyring } from '@subwallet/ui-keyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import KeyringStore from '@extension-base/stores/KeyringStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { api as soraSdk } from '@sora-substrate/sdk';
import { PASSWORD_STORAGE_KEY, readWalletRecords, removeWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { tonStore } from '@extension-base/stores/TonStore';
import { TonKeyringService } from './TonKeyring';
import { upgradeLegacyAccountPassword } from './LegacyPasswordUpgrade';
import { alreadyPersistedAccountStore, updateAccountMetadata } from './AccountMetadata';
import { preparePasswordRecords } from './PasswordChange';
import { enrollLegacyAccountNetworks } from './LegacyNetworkEnrollment';
import { WalletSecurityProvenance, withoutWalletSecurityClaims } from './WalletSecurityProvenance';
import type { EventService } from '@extension-base/services';
import type {
  DecryptForCosignerData,
  EncryptByCosignerData,
  FinalEncryptedStructure,
  RequestChangePassword,
  RequestExportSeed,
  RequestGenerateMnemonic,
  RequestMigratePassword,
  RequestUnlockExtension,
  RequestValidateMnemonic,
  ResponseExportPrivateKey,
  ResponseExportSeed,
} from '../../background/types/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeypairType } from '@subwallet/keyring/types';
import type { KeyringAddressType, KeyringItemType } from '@subwallet/ui-keyring/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';
import { buildWebUniversalWalletMigrationSnapshot } from '@/util/universalWalletKeyringMigration';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

export type WordCount = 12 | 15 | 18 | 21 | 24;

function needsLegacyPasswordMigration(pair: KeyringPair | null): pair is KeyringPair {
  if (!pair || pair.meta.isMasterPassword) return false;
  // These accounts sign outside the local encrypted keyring. Prompting for an
  // old local password would make their otherwise valid upgrade impossible.
  const meta = pair.meta;
  return !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile;
}

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly tonKeyring = new TonKeyringService(this);
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);
  readonly currentAccountReady: Promise<void>;

  private password = '';
  // Shared by password rotation and reset to exclude every account mutation.
  private walletRewriteInProgress = false;
  private unlockGeneration = 0;

  private ensureNoWalletRewrite(): void {
    if (this.walletRewriteInProgress) throw new Error('The wallet is being changed; try again in a moment');
  }
  private enrollmentEpoch = 0;
  private enrollmentWork: Promise<void> = Promise.resolve();
  private walletSecurityProvenance?: WalletSecurityProvenance;

  private get securityProvenance(): WalletSecurityProvenance {
    return this.walletSecurityProvenance ??= new WalletSecurityProvenance();
  }

  getAccountCreationMeta(suri: string, meta: FWKeyringMeta, requireFreshGeneration = false): FWKeyringMeta {
    return this.securityProvenance.accountMetadata(suri, meta, requireFreshGeneration);
  }

  // Public completion seam for lifecycle qualification; normal unlock never
  // awaits optional account generation or requires it to succeed.
  waitForLegacyNetworkEnrollment(): Promise<void> {
    return this.enrollmentWork ?? Promise.resolve();
  }

  private scheduleLegacyNetworkEnrollment(): void {
    if (!this.password) return;
    const password = this.password;
    const epoch = (this.enrollmentEpoch ?? 0) + 1;
    this.enrollmentEpoch = epoch;
    const isCurrent = () => this.enrollmentEpoch === epoch && this.password === password;
    this.enrollmentWork = (this.enrollmentWork ?? Promise.resolve()).catch(() => {}).then(async () => {
      // Start after the successful unlock response can be delivered.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent()) return;
      for (const account of this.getAccounts()) {
        if (!isCurrent()) return;
        const pair = this.getPair(account.address);
        if (!pair) continue;
        try { await enrollLegacyAccountNetworks(pair, password, isCurrent); } catch { /* Retry on a later unlock. */ }
      }
    }).catch(() => {});
  }

  constructor(eventService: EventService) {
    this.currentAccountReady = eventService.waitCryptoReady
      .then(() => {
        return new Promise<void>((resolve) => {
          this.currentAccountStore.get('CurrentAccountInfo', (rs) => {
            if (rs) this.currentAccountSubject.next(rs);
            resolve();
          });
        });
      });
    void this.currentAccountReady.catch(console.error);
  }

  get addressSubject() {
    return addressesObservable.subject;
  }

  get accountSubject() {
    return accountsObservable.subject;
  }

  get hasAccounts() {
    return this.getAllAccounts().length !== 0 || this.tonKeyring.getAccounts().length !== 0;
  }

  get hasMasterPassword() {
    return keyring.keyring.hasMasterPassword;
  }

  get keyringIsLocked() {
    // isLocked - we check only for the state when the password is set
    return this.hasMasterPassword && keyring.keyring.isLocked;
  }

  getPassword(): string {
    return this.password;
  }

  setCurrentAccount(currentAccountData: CurrentAccountState) {
    this.currentAccountSubject.next(currentAccountData);
    this.currentAccountStore.set('CurrentAccountInfo', currentAccountData);
  }

  loadAll() {
    const store = new AccountsStore();
    keyring.loadAll({
      store,
      type: 'sr25519',
      password_store: IS_EXTENSION ? new KeyringStore() : new KeyringStoreWeb(),
    });
    return store.allLoaded;
  }

  getAccounts() {
    return keyring.getAccounts().map((item) => ({ ...item, meta: item.meta as FWKeyringMeta }));
  }

  getAddresses() {
    return keyring.getAddresses().map((item) => ({ ...item, meta: item.meta as FWKeyringMeta }));
  }

  getAllAccounts() {
    return [...this.getAccounts(), ...this.getAddresses()];
  }

  getAllSubstrateAccounts() {
    return this.getAllAccounts().filter(
      ({ address, meta }) =>
        !isEthereumAddress(address) &&
        meta.walletEcosystem !== WalletEcosystem.Bitcoin &&
        meta.walletEcosystem !== WalletEcosystem.Solana &&
        meta.walletEcosystem !== WalletEcosystem.Iroha
    );
  }

  getAllEthereumAccounts() {
    return this.getAllAccounts().filter(({ address }) => isEthereumAddress(address));
  }

  // A linked EVM child is displayed with its parent. An independently imported
  // EVM account must remain selectable even when no Substrate parent exists.
  getAllMainAccounts() {
    const accounts = this.getAllAccounts();
    const linkedEthereumAddresses = new Set(accounts
      .filter(({ address }) => !isEthereumAddress(address))
      .map(({ meta }) => (meta.ethereumAddress as string | undefined)?.toLowerCase())
      .filter(Boolean));
    const mainAccounts = accounts
      .filter(({ address }) => !isEthereumAddress(address) || !linkedEthereumAddresses.has(address.toLowerCase()))
      .map((account) => isEthereumAddress(account.address) ? {
        ...account,
        meta: { ...account.meta, walletEcosystem: WalletEcosystem.Evm, ethereumAddress: account.address },
      } : account);
    return [...mainAccounts, ...this.tonKeyring.getAccounts()];
  }

  triggerWalletsSubscription(address: string, walletEcosystem: WalletEcosystem) {
    if (walletEcosystem === 'ton') {
      const accountsSubject = this.tonKeyring.accountSubject;

      accountsSubject.next(accountsSubject.getValue());

      return;
    }

    if (this.getAddress(address)) {
      addressesObservable.subject.next(addressesObservable.subject.getValue());

      return;
    }

    accountsObservable.subject.next(accountsObservable.subject.getValue());
  }

  async addAccount(suri: string, meta: FWKeyringMeta, walletEcosystem: WalletEcosystem, type?: KeypairType, requireFreshGeneration = false) {
    this.ensureNoWalletRewrite();
    const creationMeta = this.getAccountCreationMeta(suri, meta, requireFreshGeneration);
    if (walletEcosystem === 'ton') {
      const account = await this.tonKeyring.createAccount(suri, creationMeta, this.password);

      return account.address.toString();
    }

    const initialMeta = { ...creationMeta, isMobile: false, walletEcosystem };
    const {
      pair: { address },
    } = keyring.addUri(suri, initialMeta, type);

    const effectiveEcosystem = isEthereumAddress(address) ? WalletEcosystem.Evm : walletEcosystem;
    const pair = this.getPair(address);

    if (pair) {
      await this.saveAccountMeta(address, { ...initialMeta, walletEcosystem: effectiveEcosystem });
    }

    return address;
  }

  saveAddress(address: string, meta: FWKeyringMeta, type: KeyringAddressType) {
    this.ensureNoWalletRewrite();
    keyring.saveAddress(
      address,
      {
        ...meta,
        walletEcosystem: WalletEcosystem.Substrate,
      },
      type
    );
  }

  backupAccount(address: string, password: string) {
    const pair = this.getPair(address);

    if (!pair) return;

    return keyring.backupAccount(pair, password);
  }

  getPair(addressOrPair: string | KeyringPair) {
    if (typeof addressOrPair !== 'string') return addressOrPair;

    try {
      return keyring.getPair(addressOrPair);
    } catch {
      return null;
    }
  }

  getAccountName(address: string) {
    try {
      const keyringAddress = isEthereumAddress(address) ? address : this.encodeAddress(address);

      return this.getAllSubstrateAccounts().find(({ address }) => isSameString(address, keyringAddress))?.meta.name;
    } catch {
      return undefined;
    }
  }

  getAccount(address: string, walletEcosystem = WalletEcosystem.Substrate) {
    try {
      if (walletEcosystem === 'ton') return this.tonKeyring.getAccount(address);

      return keyring.getAccount(address);
    } catch {
      return undefined;
    }
  }

  getAddress(address: string, type: KeyringItemType | null = null) {
    return keyring.getAddress(address, type);
  }

  async forgetAccount(address: string) {
    this.ensureNoWalletRewrite();
    if (this.tonKeyring.accountSubject.value[address]) await this.tonKeyring.forgetAccount(address);
    else keyring.forgetAccount(address);
  }

  forgetAddress(address: string) {
    this.ensureNoWalletRewrite();
    return keyring.forgetAddress(address);
  }

  restoreAccount(file: KeyringPair$Json, password: string, withMasterPassword: boolean = true) {
    this.ensureNoWalletRewrite();
    file.meta = withoutWalletSecurityClaims(file.meta as FWKeyringMeta);
    delete file.meta.genesisHash;
    delete file.meta.isMasterAccount;
    delete file.meta.isMasterPassword;
    delete file.meta.isMobile;

    const ethereumAddress = (file.meta as FWKeyringMeta).ethereumAddress ?? '';

    if (!this.getAccount(ethereumAddress)) delete file.meta.ethereumAddress;

    return keyring.restoreAccount(file, password, withMasterPassword);
  }

  createFromJson(file: KeyringPair$Json) {
    file.meta = withoutWalletSecurityClaims(file.meta as FWKeyringMeta);
    delete file.meta.genesisHash;
    delete file.meta.isMasterAccount;
    delete file.meta.isMasterPassword;
    delete file.meta.isMobile;

    return keyring.createFromJson(file);
  }

  unlockPair(addressOrPair: string | KeyringPair) {
    const pair = this.getPair(addressOrPair);

    if (!pair) return false;

    const { address } = pair;
    const isEthereum = isEthereumAddress(address);

    const substrateAddress = this.getSubstrateAddress(address);
    const substratePair = isEthereum ? this.getPair(substrateAddress) : pair;

    const ethereumAddress = isEthereum ? address : (substratePair?.meta.ethereumAddress as string | undefined);
    const ethereumPair = isEthereum ? pair : ethereumAddress ? this.getPair(ethereumAddress) : undefined;

    if (!substratePair) return false;

    try {
      keyring.unlockPair(substrateAddress);

      if (ethereumAddress) keyring.unlockPair(ethereumAddress);

      return true;
    } catch {
      substratePair.lock();
      ethereumPair?.lock();

      return false;
    }
  }

  lockPair(addressOrPair: string | KeyringPair | undefined) {
    if (addressOrPair === undefined) return;

    const pair = this.getPair(addressOrPair);

    if (!pair) return;

    return pair.lock();
  }

  encodeAddress(address: string | Uint8Array, prefix = 42) {
    return keyring.encodeAddress(address, prefix);
  }

  decodeAddress(key: string | Uint8Array, ignoreChecksum?: boolean, ss58Format?: number) {
    return keyring.decodeAddress(key, ignoreChecksum, ss58Format);
  }

  async saveAccountMeta(address: string, meta: FWKeyringMeta) {
    this.ensureNoWalletRewrite();
    // Renames, enrollment and caller-supplied metadata cannot establish or
    // remove the provenance recorded when a genuinely fresh root was saved.
    meta = withoutWalletSecurityClaims(meta);
    const pair = this.getPair(address);

    if (pair) {
      const walletEcosystem =
        isEthereumAddress(address) && meta.walletEcosystem === undefined
          ? WalletEcosystem.Evm
          : meta.walletEcosystem ?? (pair.meta as FWKeyringMeta).walletEcosystem;

      return this.tonKeyring.withStoreLock(() => updateAccountMetadata(pair, (current) =>
        withUniversalWalletKeyringMeta(address, { ...current, ...meta }, walletEcosystem)
      ), false);
    }

    const account = this.getAddress(address);

    if (account) {
      this.saveAddress(
        address,
        withUniversalWalletKeyringMeta(address, { ...(account.meta as FWKeyringMeta), ...meta }, meta.walletEcosystem),
        'address'
      );
    }
  }

  createFromUri(suri: string, keypairType: KeypairType, meta: FWKeyringMeta = {}) {
    return keyring.createFromUri(suri, withoutWalletSecurityClaims(meta), keypairType);
  }

  getSubstrateAddress(address: string) {
    if (!isEthereumAddress(address)) return address;

    const accounts = this.getAllSubstrateAccounts();

    const account = accounts.find(({ meta: { ethereumAddress } }) => isSameString(ethereumAddress as string, address));

    return account?.address ?? address;
  }

  getEthereumAddress(address: string) {
    if (isEthereumAddress(address)) return address;

    const accounts = this.getAllAccounts();
    const addresses = this.getAddresses();

    const account =
      accounts.find(({ address: _address }) => _address === address) ||
      addresses.find(({ address: _address }) => _address === address);

    return (account?.meta.ethereumAddress as string) ?? '';
  }

  isMobileAccount(address: string): boolean {
    const account =
      this.getAllAccounts().find((el) => el.address === address) ||
      this.getAddresses().find((el) => el.address === address || el.meta.ethereumAddress === address);

    if (!account) throw new Error('Couldnt find account');

    return !!account.meta.isMobile;
  }

  async changeMasterPassword({ newPassword, oldPassword }: RequestChangePassword): Promise<boolean> {
    if (this.walletRewriteInProgress) return false;

    this.walletRewriteInProgress = true;
    const generation = ++this.unlockGeneration;
    let committed = false;

    this.password = '';
    this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
    keyring.lockAll();

    try {
      // Optional metadata enrollment and queued account creation must finish
      // before the atomic password snapshot; a stale encrypted write cannot win later.
      await this.waitForLegacyNetworkEnrollment();
      return await this.tonKeyring.withStoreLock(async () => {
        await (IS_EXTENSION ? BaseExtensionStore : BaseWebStore).flush();
        if (!IS_EXTENSION) await KeyringStoreWeb.flush();
        const records = await readWalletRecords();
        const prepared = preparePasswordRecords(records, oldPassword || '', newPassword);
        // Older resets could leave TON records behind without a verifier.
        // Establishing the first password must not open or rewrite those records.
        const tonAccounts = records[PASSWORD_STORAGE_KEY]
          ? await this.tonKeyring.preparePasswordChange(oldPassword || '', newPassword)
          : [];

        for (const account of tonAccounts) {
          prepared.replacements[`${tonStore.getPrefix()}${account.address}`] = account;
        }

        await writeWalletRecords(prepared.replacements);
        committed = true;

        // Publish only committed records. A memory-only store prevents the account
        // observable from issuing separate writes after the atomic storage batch.
        keyring.keyring.setupMasterPassword(prepared.password.passwordHash);
        if (!IS_EXTENSION) KeyringStoreWeb.applyCommittedPassword(prepared.password);

        for (const json of prepared.accounts) {
          const pair = keyring.keyring.addFromJson(json, true);

          keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
        }

        this.tonKeyring.applyAccounts(tonAccounts);
        keyring.lockAll();

        if (generation === this.unlockGeneration) {
          keyring.unlockKeyring(newPassword);
          this.password = newPassword;
          this.scheduleLegacyNetworkEnrollment();
        }

        return true;
      });
    } catch {
      if (generation === this.unlockGeneration) {
        keyring.lockAll();
        this.password = '';
      }

      // A committed verifier is authoritative even if rebuilding memory fails.
      return committed;
    } finally {
      this.walletRewriteInProgress = false;
    }
  }

  async mnemonicGenerate({ walletEcosystem, wordCount }: RequestGenerateMnemonic): Promise<string> {
    const mnemonic = walletEcosystem === 'ton'
      ? (await this.tonKeyring.generateMnemonic(undefined, wordCount)).join(' ')
      : mnemonicGenerate(wordCount);
    this.securityProvenance.rememberGeneratedMnemonic(mnemonic);
    return mnemonic;
  }

  async mnemonicValidate({ walletEcosystem, seed }: RequestValidateMnemonic): Promise<boolean> {
    if (walletEcosystem === 'ton') {
      const value = await this.tonKeyring.validateMnemonic(seed.split(' '));

      return value;
    }

    return mnemonicValidate(seed);
  }

  async exportAccountMnemonic(request: RequestExportSeed): Promise<ResponseExportSeed> {
    if (request.walletEcosystem === WalletEcosystem.Ton) {
      return { seed: await this.tonKeyring.decodeAccountMnemonic(request.address, request.password ?? this.password) };
    }
    return this.exportMnemonic(request);
  }

  exportMnemonic({ address, password, walletEcosystem }: RequestExportSeed): ResponseExportSeed {
    if (walletEcosystem === WalletEcosystem.Ton) {
      throw new Error('TON mnemonic export requires exportAccountMnemonic');
    }

    const passphrase = password ?? this.password;

    try {
      const pair = keyring.getPair(address);
      const seed = pair.exportMnemonic(passphrase);

      return { seed };
    } catch {
      try {
        const json = this.backupAccount(address, passphrase);
        const seed = json ? decodeMnemonicFromJsonBackup(json, passphrase) : '';

        return { seed };
      } catch {
        return { seed: '' };
      }
    }
  }

  public accountExportPrivateKey({ address }: RequestExportSeed): ResponseExportPrivateKey {
    const json = this.backupAccount(address, this.password);

    if (!json) throw new Error('Json was not exported');

    const decoded = decodePair(this.password, base64Decode(json.encoded), json.encoding.type);

    const privateKey = u8aToHex(decoded.secretKey);
    const publicKey = u8aToHex(decoded.publicKey);

    return {
      privateKey,
      publicKey,
    };
  }

  public accountExportRawSeed(request: RequestExportSeed): ResponseExportSeed {
    if (request.isEVM) {
      const { privateKey } = this.accountExportPrivateKey(request);

      return { seed: privateKey };
    }

    const { seed } = this.exportMnemonic(request);

    if (!seed) return { seed: '' };

    // Convert mnemonic to raw seed (32 bytes for sr25519)
    const seedU8 = mnemonicToMiniSecret(seed);

    // Convert the raw seed in hex format
    const rawSeed = u8aToHex(seedU8);

    return { seed: rawSeed };
  }

  public accountExportSecretKey(request: RequestExportSeed): Uint8Array | null {
    const { seed } = this.exportMnemonic(request);

    if (!seed) return null;

    return sr25519PairFromSeed(mnemonicToMiniSecret(seed)).secretKey;
  }

  decryptForCosigner({ address, data, encryptorPublicKey }: DecryptForCosignerData): string {
    const pair = this.getPair(address);

    if (!pair) throw new Error('Key pair does not exist');

    const secretKey = this.accountExportSecretKey({ address, password: this.password });

    if (secretKey === null) throw new Error('Secret key is undefined');

    return soraSdk.crypto.decryptForCosigner(address, encryptorPublicKey, data, secretKey);
  }

  encryptByCosigner({ address, data, cosigners }: EncryptByCosignerData): FinalEncryptedStructure {
    if (this.password === '') throw new Error('First unlock the extension');

    const pair = this.getPair(address);

    if (!pair) throw new Error('Key pair does not exist');

    const secretKey = this.accountExportSecretKey({ address, password: this.password });

    if (secretKey === null) throw new Error('Secret key is undefined');

    const cosignerBytes = Object.fromEntries(Object.entries(cosigners).map(([key, value]) => [key, hexToU8a(value)]));

    return soraSdk.crypto.encryptBySigner(data, cosignerBytes, secretKey);
  }

  async unlockKeyring({ password }: RequestUnlockExtension): Promise<boolean | 'ton-recovery-required' | 'ton-storage-unavailable'> {
    if (this.walletRewriteInProgress) return false;

    const generation = ++this.unlockGeneration;

    this.password = '';
    this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
    keyring.lockAll();

    try {
      keyring.unlockKeyring(password);
      keyring.lockAll();
      let tonStorageUnavailable = false;
      try {
        await this.tonKeyring.migrateOnUnlock(password);
        tonStorageUnavailable = this.tonKeyring.hasStorageIssues;
      } catch {
        // The master verifier already succeeded. Optional TON storage failure
        // must not prevent recovery of unrelated, valid accounts.
        tonStorageUnavailable = true;
      }

      if (generation !== this.unlockGeneration) return false;

      keyring.unlockKeyring(password);
      this.password = password;
      this.scheduleLegacyNetworkEnrollment();

      if (tonStorageUnavailable) return 'ton-storage-unavailable';
      return this.tonKeyring.hasRecoveryAccounts ? 'ton-recovery-required' : true;
    } catch {
      if (generation === this.unlockGeneration) {
        keyring.lockAll();
        this.password = '';
      }

      return false;
    }
  }

  lockKeyring(): boolean {
    this.unlockGeneration += 1;
    try {
      keyring.lockAll();

      this.password = '';
      this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  async resetWallet(): Promise<boolean> {
    if (this.walletRewriteInProgress) return false;
    this.walletRewriteInProgress = true;
    this.unlockGeneration += 1;
    this.password = '';
    this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
    keyring.lockAll();
    let committed = false;

    try {
      await this.waitForLegacyNetworkEnrollment();
      await this.tonKeyring.reset(async () => {
        // Wait even for a failed earlier write: no delayed account/verifier
        // write may arrive after the reset snapshot and recreate the wallet.
        const flushes = [(IS_EXTENSION ? BaseExtensionStore : BaseWebStore).flush()];
        if (!IS_EXTENSION) flushes.push(KeyringStoreWeb.flush());
        await Promise.allSettled(flushes);
        const prefixes = ['account:', 'address:', 'contract:', 'ton:'].map((prefix) => `${EXTENSION_PREFIX}:${prefix}`);
        const keys = Object.keys(await readWalletRecords()).filter((key) =>
          key === PASSWORD_STORAGE_KEY || prefixes.some((prefix) => key.startsWith(prefix)));
        await removeWalletRecords(keys);
        committed = true;
      });
      if (!IS_EXTENSION) KeyringStoreWeb.applyCommittedPassword(null);
      // These library removals clear observers and find no stored wallet left.
      keyring.resetWallet(true);
      const flushes = [(IS_EXTENSION ? BaseExtensionStore : BaseWebStore).flush()];
      if (!IS_EXTENSION) flushes.push(KeyringStoreWeb.flush());
      await Promise.allSettled(flushes);
      return true;
    } catch {
      // Storage is authoritative after commit; a restart clears stale memory.
      return committed;
    } finally {
      this.walletRewriteInProgress = false;
    }
  }

  getMigrationAccounts() {
    return this.getAccounts()
      .map(({ address }) => this.getPair(address))
      .filter(needsLegacyPasswordMigration);
  }

  isNeedMigration(): boolean {
    return this.getMigrationAccounts().length !== 0;
  }

  getUniversalWalletMigrationSnapshot() {
    return buildWebUniversalWalletMigrationSnapshot({
      accounts: [
        ...this.getAccounts().map(({ address, meta }) => ({
          address,
          meta,
          type: isEthereumAddress(address) ? 'ethereum' : undefined,
        })),
        ...Object.values(this.tonKeyring.accountSubject.value).map(({ json: { address, meta } }) => ({
          address,
          meta: meta as FWKeyringMeta,
        })),
      ],
    });
  }

  async keyringMigrateMasterPassword({ address, password }: RequestMigratePassword): Promise<boolean> {
    this.ensureNoWalletRewrite();
    return this.tonKeyring.withStoreLock(async () => {
      try {
        const pair = this.getPair(address);
        if (!pair) return false;
        const ethereumAddress = pair.meta.ethereumAddress as string | undefined;
        const child = ethereumAddress ? this.getPair(ethereumAddress) : null;
        // Keep independently encrypted children discoverable after a partial
        // migration. Each pair is migrated once and remains retryable on reopen.
        const pending = [...new Set([child, pair])].filter(needsLegacyPasswordMigration);
        for (const candidate of pending) {
          // Validate every old password before changing either pair. A linked
          // account may have its own password and can be migrated separately.
          const wasLocked = candidate.isLocked;
          try {
            candidate.decodePkcs8(password);
          } finally {
            if (wasLocked) candidate.lock();
          }
        }
        for (const candidate of pending) {
          await upgradeLegacyAccountPassword(candidate, password);
        }
        this.scheduleLegacyNetworkEnrollment();

        return true;
      } catch (e) {
        console.error(e);

        return false;
      }
    }, false);
  }
}
