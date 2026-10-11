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
import { ecdsaPairKeys } from '@extension-base/stores/EcdsaAccountRecords';
import { tonStore } from '@extension-base/stores/TonStore';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import KeyringStore from '@extension-base/stores/KeyringStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { api as soraSdk } from '@sora-substrate/sdk';
import { TonKeyringService } from './TonKeyring';
import { commitMasterEncryptedCopy, upgradeLegacyAccountPassword } from './LegacyPasswordUpgrade';
import { updateAccountMetadata } from './AccountMetadata';
import { enrollLegacyAccountNetworks } from './LegacyNetworkEnrollment';
import {
  AccountAccessService,
  decodesWithPassword,
  isMasterPasswordPair,
  needsLegacyPasswordMigration,
  summarizeLegacyPasswordAccounts,
} from './AccountAccess';
import { LEGACY_PASSWORD_REQUIRED, PREVIOUS_PASSWORD_REQUIRED } from './AccountAccessErrors';
import {
  deletedWalletId,
  deletedWalletKey,
  loadableAccountRecords,
  readDeletedWallet,
  summarizeDeletedWallets,
  walletRecordKeys,
  type DeletedWallet,
} from './DeletedWallets';
import type { StagedTonSeed } from './TonSeedVault';
import type { EventService } from '@extension-base/services';
import type {
  AccountAccessStatus,
  DecryptForCosignerData,
  DeletedWalletSummary,
  EncryptByCosignerData,
  FinalEncryptedStructure,
  LegacyPasswordAccountSummary,
  RequestChangePassword,
  RequestExportSeed,
  RequestGenerateMnemonic,
  RequestMigratePassword,
  RequestRecoverAccountWithPassword,
  RequestRecoverAccountWithPhrase,
  RequestUnlockExtension,
  RequestValidateMnemonic,
  ResponseExportPrivateKey,
  ResponseExportSeed,
  ResponseRecoverAccountWithPassword,
  ResponseRecoverAccountWithPhrase,
  ResponseRestoreDeletedWallet,
} from '../../background/types/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeypairType } from '@subwallet/keyring/types';
import type { KeyringAddressType, KeyringItemType } from '@subwallet/ui-keyring/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';
import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';
import { TonKeyringError, type TonImportChoice } from '@/util/tonKeyring';
import { buildWebUniversalWalletMigrationSnapshot } from '@/util/universalWalletKeyringMigration';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

export type WordCount = 12 | 15 | 18 | 21 | 24;

type LegacyMigrationResult = 'migrated' | 'wrong_password' | 'not_found' | 'storage_failed';

// Resolves once every wallet write queued so far has landed, and rejects if one of them failed.
async function flushWalletWrites(): Promise<void> {
  if (IS_EXTENSION) return BaseExtensionStore.flush();

  const results = await Promise.allSettled([BaseWebStore.flush(), KeyringStoreWeb.flush()]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly tonKeyring = new TonKeyringService(this);
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);
  readonly currentAccountReady: Promise<void>;

  private accountsStore?: AccountsStore;
  private accountAccess?: AccountAccessService;
  private password = '';
  private enrollmentEpoch = 0;
  private enrollmentWork: Promise<void> = Promise.resolve();
  private enrollmentGate: (address: string) => boolean = () => true;

  private get access(): AccountAccessService {
    return (this.accountAccess ??= new AccountAccessService(this));
  }

  // Public completion seam, like waitForLegacyNetworkEnrollment: unlock never awaits the TON check.
  waitForAccessScan(): Promise<void> {
    return this.access.waitForScan();
  }

  // Public completion seam for lifecycle qualification; normal unlock never
  // awaits optional account generation or requires it to succeed.
  waitForLegacyNetworkEnrollment(): Promise<void> {
    return this.enrollmentWork ?? Promise.resolve();
  }

  // Accounts the gate refuses keep exactly the networks they have (LegacyExposureService holds back
  // accounts that may be exposed until the security notice is acknowledged).
  setLegacyNetworkEnrollmentGate(gate: (address: string) => boolean): void {
    this.enrollmentGate = gate;
  }

  // For the gate's owner, once it allows more accounts. Does nothing while the wallet is locked.
  resumeLegacyNetworkEnrollment(): void {
    this.scheduleLegacyNetworkEnrollment();
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
        // Asked per account at the time of use: an acknowledgement may arrive while this runs.
        if (this.enrollmentGate && !this.enrollmentGate(account.address)) continue;
        const pair = this.getPair(account.address);
        if (!pair) continue;
        try { await enrollLegacyAccountNetworks(pair, password, isCurrent); } catch { /* Retry on a later unlock. */ }
      }
    }).catch(() => {});
  }

  constructor(eventService: EventService) {
    this.currentAccountReady = eventService.waitCryptoReady.then(() => this.restoreCurrentAccount());
    void this.currentAccountReady.catch(console.error);
  }

  // A failed read rejects instead of leaving start-up waiting; start-up calls this again.
  async restoreCurrentAccount(): Promise<void> {
    const currentAccount = await this.currentAccountStore.getAndWait('CurrentAccountInfo');

    if (currentAccount) this.currentAccountSubject.next(currentAccount);
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

  // ui-keyring's loadAll() works once per service worker: it ends by initialising its
  // options, which throws on any later call (Keyring.js in @subwallet/ui-keyring 0.1.14).
  // After a failed read, the stored accounts are read again through the same store.
  loadAll() {
    if (this.accountsStore) return this.accountsStore.reloadAll();

    const store = new AccountsStore();
    keyring.loadAll({
      store,
      type: 'sr25519',
      password_store: IS_EXTENSION ? new KeyringStore() : new KeyringStoreWeb(),
    });
    this.accountsStore = store;
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

  async addAccount(
    suri: string,
    meta: FWKeyringMeta,
    walletEcosystem: WalletEcosystem,
    type?: KeypairType,
    tonImport?: TonImportChoice
  ) {
    if (walletEcosystem === 'ton') {
      const account = await this.tonKeyring.createAccount(suri, meta, this.password, tonImport);

      return account.address.toString();
    }

    const initialMeta = { ...meta, isMobile: false, walletEcosystem };
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

  forgetAccount(address: string) {
    if (this.tonKeyring.accountSubject.value[address]) {
      this.tonKeyring.forgetAccount(address);

      return;
    }

    const pair = this.getPair(address);

    keyring.forgetAccount(address);
    if (pair) this.forgetEarlierRecords(pair);
  }

  // ui-keyring deletes an account's record under its current key only. An ECDSA account kept from 2.x or 3.0.x
  // also has the record those versions wrote under its account id, set aside at load (EcdsaAccountRecords.ts).
  // They go with the account, so it does not come back at the next start.
  private forgetEarlierRecords(pair: KeyringPair): void {
    const keys = ecdsaPairKeys(pair);

    if (!keys) return;

    const store = this.accountsStore ?? new AccountsStore();

    store.remove(keys.legacy);
    store.remove(keys.archive);
  }

  forgetAddress(address: string) {
    return keyring.forgetAddress(address);
  }

  /**
   * Keeps every stored record that holds this wallet's keys (its account, its linked Ethereum account, the records an
   * ECDSA account had before, its TON phrase) exactly as stored, in one entry Account access can restore
   * (DeletedWallets.ts). Settles once that entry is written and rejects if it is not, so a wallet is deleted only
   * when its keys are kept.
   */
  async archiveWallet(address: string): Promise<void> {
    const store = this.accountsStore ?? new AccountsStore();
    const ton = this.tonKeyring.accountSubject.value[address] ? await tonStore.getAndWait(address) : undefined;
    const pair = ton ? null : this.getPair(address);
    const ethereumAddress = pair?.meta.ethereumAddress as string | undefined;
    const ethereumPair = ethereumAddress ? this.getPair(ethereumAddress) : null;
    const keys = walletRecordKeys([pair, ethereumPair].filter((candidate): candidate is KeyringPair => !!candidate));
    const records = await Promise.all(keys.map(async (key) => [key, await store.getAndWait(key)] as const));
    const accounts = Object.fromEntries(records.filter(([, record]) => record !== undefined));

    if (!ton && !Object.keys(accounts).length) return;

    const meta = (pair?.meta ?? {}) as FWKeyringMeta;
    const deletedAt = Date.now();
    const wallet: DeletedWallet = {
      address,
      name: ton?.name ?? (typeof meta.name === 'string' ? meta.name : ''),
      walletEcosystem: ton ? WalletEcosystem.Ton : (meta.walletEcosystem as WalletEcosystem | undefined) ?? WalletEcosystem.Substrate,
      deletedAt,
      accounts,
      ...(ton ? { ton } : {}),
    };

    await store.replaceAndWait({ [deletedWalletKey(deletedWalletId(address, deletedAt))]: wallet }, []);
  }

  private isInWallet(address: string): boolean {
    return !!this.tonKeyring.accountSubject.value[address] || !!this.getPair(address);
  }

  async getDeletedWallets(): Promise<DeletedWalletSummary[]> {
    const store = this.accountsStore ?? new AccountsStore();
    let stored: Record<string, unknown> = {};

    await store.allMap((map) => (stored = map));

    return summarizeDeletedWallets(stored, (address) => this.isInWallet(address));
  }

  /**
   * Puts a deleted wallet's records back where they were and loads them, as a start would. A record that is stored
   * now (the same account imported again) is never written over; the kept copy is removed only once every record
   * of it is back.
   */
  async restoreDeletedWallet(id: string): Promise<ResponseRestoreDeletedWallet> {
    let restored: Awaited<ReturnType<KeyringService['writeBackDeletedWallet']>>;

    try {
      restored = await this.writeBackDeletedWallet(id);
    } catch (e) {
      console.error(e);

      return { ok: false, code: 'storage_failed' };
    }

    if ('code' in restored) return { ok: false, code: restored.code };

    const { wallet, accounts, tonWritten } = restored;

    if (wallet.ton && tonWritten) {
      this.tonKeyring.setAccounts({ ...wallet.ton, address: wallet.address });
      // A phrase kept under an earlier password is listed in Account access, as after an unlock.
      if (this.password) this.access.scheduleScan(this.password);
    }

    // What keyring.loadAll does with each stored record at a start (Keyring.loadAccount, private in its typings).
    const loader = keyring as unknown as { loadAccount: (json: KeyringPair$Json, key: string) => void };

    loadableAccountRecords(accounts).forEach(([key, record]) => loader.loadAccount(record as KeyringPair$Json, key));

    return { ok: true, address: wallet.address, name: wallet.name, walletEcosystem: wallet.walletEcosystem };
  }

  private async writeBackDeletedWallet(
    id: string
  ): Promise<{ code: 'not_found' | 'already_in_wallet' } | { wallet: DeletedWallet; accounts: Record<string, unknown>; tonWritten: boolean }> {
    const store = this.accountsStore ?? new AccountsStore();
    const key = deletedWalletKey(id);
    const wallet = readDeletedWallet(await store.getAndWait(key));

    if (!wallet) return { code: 'not_found' };
    if (this.isInWallet(wallet.address)) return { code: 'already_in_wallet' };

    const records = Object.entries(wallet.accounts);
    const current = await Promise.all(records.map(([recordKey]) => store.getAndWait(recordKey)));
    const accounts = Object.fromEntries(records.filter((_record, index) => current[index] === undefined));
    const { ton } = wallet;
    // Written only where nothing is stored, in one queued read and write.
    const tonWritten = !!ton && (await tonStore.updateAndWait(wallet.address, (stored) => (stored ? undefined : ton))) !== undefined;
    const everyRecordIsBack = (!ton || tonWritten) && Object.keys(accounts).length === records.length;

    await store.replaceAndWait(accounts, everyRecordIsBack ? [key] : []);

    return { wallet, accounts, tonWritten };
  }

  restoreAccount(file: KeyringPair$Json, password: string, withMasterPassword: boolean = true) {
    delete file.meta.genesisHash;
    delete file.meta.isMasterAccount;
    delete file.meta.isMasterPassword;
    delete file.meta.isMobile;

    const ethereumAddress = (file.meta as FWKeyringMeta).ethereumAddress ?? '';

    if (!this.getAccount(ethereumAddress)) delete file.meta.ethereumAddress;

    return keyring.restoreAccount(file, password, withMasterPassword);
  }

  createFromJson(file: KeyringPair$Json) {
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

    // A stable code instead of a decryption failure; nothing is unlocked.
    if (needsLegacyPasswordMigration(pair)) throw new Error(LEGACY_PASSWORD_REQUIRED);

    // Each key opens on its own: a linked account that still waits for its legacy password, or that
    // was left under an earlier master password, does not keep this account from signing.
    const linkedPairs = [...new Set([substratePair, ethereumPair])].filter(
      (linkedPair): linkedPair is KeyringPair => !!linkedPair && !needsLegacyPasswordMigration(linkedPair)
    );
    let unlocked = true;

    for (const linkedPair of linkedPairs) {
      try {
        keyring.unlockPair(linkedPair.address);
      } catch {
        linkedPair.lock();

        const needsPreviousPassword = this.flagIfPreviousMasterPassword(linkedPair);

        if (linkedPair !== pair) continue;
        if (needsPreviousPassword) throw new Error(PREVIOUS_PASSWORD_REQUIRED);

        unlocked = false;
      }
    }

    return unlocked;
  }

  // A local key that does not open with the current master password was left under an earlier one,
  // for example by an interrupted password change. It is listed in Account access until recovered.
  // Detected only when used: opening every key at unlock would cost about 100 ms of scrypt each.
  private flagIfPreviousMasterPassword(pair: KeyringPair, passphrase = this.password): boolean {
    if (!this.password || passphrase !== this.password || !isMasterPasswordPair(pair)) return false;

    this.access.flagPreviousMasterPair(pair.address);

    return true;
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
    const pair = this.getPair(address);

    if (pair) {
      const walletEcosystem =
        isEthereumAddress(address) && meta.walletEcosystem === undefined
          ? WalletEcosystem.Evm
          : meta.walletEcosystem ?? (pair.meta as FWKeyringMeta).walletEcosystem;

      return updateAccountMetadata(pair, (current) =>
        withUniversalWalletKeyringMeta(address, { ...current, ...meta }, walletEcosystem)
      );
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
    return keyring.createFromUri(suri, meta, keypairType);
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

  // TON phrases are encrypted outside ui-keyring, so they are re-encrypted here: a verified copy under
  // the new password is staged next to each ciphertext, the keyring password changes, and only then do
  // the copies become current. An interruption at any point leaves a copy the current password opens.
  async changeMasterPassword({ newPassword, oldPassword }: RequestChangePassword): Promise<boolean> {
    const { vault } = this.tonKeyring;

    return vault.exclusive(async () => {
      const wasLocked = !this.password;
      const hadMasterPassword = this.hasMasterPassword;

      if (!newPassword || (hadMasterPassword && !this.verifyMasterPassword(oldPassword))) return false;

      let staged: StagedTonSeed[] = [];
      let setAside: KeyringPair[];

      try {
        if (hadMasterPassword) staged = await vault.stage(oldPassword!, newPassword);
        setAside = this.changeKeyringPassword(newPassword, hadMasterPassword ? oldPassword : undefined);
      } catch (e) {
        console.error(e);
        await vault.rollback(staged);
        if (wasLocked) keyring.lockAll();

        return false;
      }

      this.password = newPassword;
      setAside.forEach(({ address }) => this.access.flagPreviousMasterPair(address));
      // The staged TON copies become current only once the new password hash and keys are stored.
      await flushWalletWrites();
      await vault.commit(staged);
      this.scheduleLegacyNetworkEnrollment();
      this.access.scheduleScan(newPassword);

      return true;
    });
  }

  // Checks the old password before anything is written. A wrong one changes nothing.
  private verifyMasterPassword(password?: string): boolean {
    if (!password) return false;
    if (this.password) return password === this.password;

    try {
      keyring.unlockKeyring(password);

      return true;
    } catch {
      return false;
    }
  }

  // ui-keyring re-encrypts every master-password key and stores them only when all of them succeeded,
  // after it has already stored the new password hash. One key left under an earlier password would
  // abort that and strand every key under the old password. Such keys are set aside: they keep their
  // stored ciphertext and are recovered with the password that opens them.
  private changeKeyringPassword(newPassword: string, oldPassword?: string): KeyringPair[] {
    const setAside = oldPassword
      ? this.getAccounts()
          .map(({ address }) => this.getPair(address))
          .filter((pair): pair is KeyringPair => isMasterPasswordPair(pair))
          .filter((pair) => pair.isLocked && !decodesWithPassword(pair, oldPassword))
      : [];

    setAside.forEach((pair) => pair.setMeta({ isMasterPassword: false }));

    try {
      keyring.changeMasterPassword(newPassword, oldPassword);
    } finally {
      setAside.forEach((pair) => pair.setMeta({ isMasterPassword: true }));
    }

    return setAside;
  }

  async mnemonicGenerate({ walletEcosystem, wordCount }: RequestGenerateMnemonic): Promise<string> {
    if (walletEcosystem === 'ton') {
      const seed = await this.tonKeyring.generateMnemonic(undefined, wordCount);

      return seed.join(' ');
    }

    return mnemonicGenerate(wordCount);
  }

  async mnemonicValidate({ walletEcosystem, seed }: RequestValidateMnemonic): Promise<boolean> {
    if (walletEcosystem === 'ton') {
      const value = await this.tonKeyring.validateMnemonic(seed.split(' '));

      return value;
    }

    return mnemonicValidate(seed);
  }

  // `pri(keyring.export.mnemonic)`. A TON phrase is returned exactly as stored, only after it derived the
  // account's public key, and never empty: a phrase that does not open throws its recovery code.
  async exportAccountMnemonic(request: RequestExportSeed): Promise<ResponseExportSeed> {
    if (request.walletEcosystem !== WalletEcosystem.Ton) return this.exportMnemonic(request);
    if (request.password !== undefined && request.password !== this.password) throw new TonKeyringError('wrong_password');

    return { seed: await this.tonKeyring.decodeMnemonicVerified(request.address) };
  }

  // Keyring accounts only; TON phrases are verified asynchronously by exportAccountMnemonic.
  exportMnemonic({ address, password, walletEcosystem }: RequestExportSeed): ResponseExportSeed {
    if (walletEcosystem === WalletEcosystem.Ton) throw new TonKeyringError('ton_export_requires_verification');

    const passphrase = password ?? this.password;
    const accountPair = this.getPair(address);

    if (needsLegacyPasswordMigration(accountPair)) throw new Error(LEGACY_PASSWORD_REQUIRED);

    try {
      const pair = keyring.getPair(address);
      const seed = pair.exportMnemonic(passphrase);

      return { seed };
    } catch {
      let json: KeyringPair$Json | undefined;

      try {
        json = this.backupAccount(address, passphrase);
      } catch {
        if (accountPair && this.flagIfPreviousMasterPassword(accountPair, passphrase)) {
          throw new Error(PREVIOUS_PASSWORD_REQUIRED);
        }

        return { seed: '' };
      }

      try {
        const seed = json ? decodeMnemonicFromJsonBackup(json, passphrase) : '';

        return { seed };
      } catch {
        return { seed: '' };
      }
    }
  }

  public accountExportPrivateKey({ address }: RequestExportSeed): ResponseExportPrivateKey {
    const pair = this.getPair(address);

    if (needsLegacyPasswordMigration(pair)) throw new Error(LEGACY_PASSWORD_REQUIRED);

    let json: KeyringPair$Json | undefined;

    try {
      json = this.backupAccount(address, this.password);
    } catch (error) {
      if (pair && this.flagIfPreviousMasterPassword(pair)) throw new Error(PREVIOUS_PASSWORD_REQUIRED, { cause: error });

      throw error;
    }

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

  unlockKeyring({ password }: RequestUnlockExtension): boolean {
    try {
      keyring.unlockKeyring(password);
      this.password = password;
      this.scheduleLegacyNetworkEnrollment();
      this.access.scheduleScan(password);

      return true;
    } catch (e) {
      console.info(e);

      return false;
    }
  }

  lockKeyring(): boolean {
    try {
      keyring.lockAll();

      this.password = '';
      this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
      this.access.cancelScan();

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  resetWallet(): boolean {
    try {
      const pairs = Object.keys(this.accountSubject.value)
        .map((address) => this.getPair(address))
        .filter((pair): pair is KeyringPair => !!pair);

      keyring.resetWallet(true);
      pairs.forEach((pair) => this.forgetEarlierRecords(pair));
      this.password = '';
      this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
      // TON records are not part of the reset (as in 3.0.5); they are listed for recovery after the
      // new password is set.
      this.access.reset();

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  private getLegacyPasswordPairs(): KeyringPair[] {
    return this.getAccounts()
      .map(({ address }) => this.getPair(address))
      .filter((pair): pair is KeyringPair => needsLegacyPasswordMigration(pair));
  }

  getMigrationAccounts(): LegacyPasswordAccountSummary[] {
    return summarizeLegacyPasswordAccounts(this.getLegacyPasswordPairs(), this.getAccounts());
  }

  getAccessStatus(): Promise<AccountAccessStatus> {
    return this.access.getStatus(this.getLegacyPasswordPairs());
  }

  // Whether to show the per-account password prompt now. Accounts that are still pending after the
  // user chose "Skip for now" stay listed in getAccessStatus().issues.
  async isNeedMigration(): Promise<boolean> {
    return (await this.getAccessStatus()).promptPending;
  }

  deferLegacyPasswordMigration(): Promise<boolean> {
    return this.access.defer();
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

  // True once the requested account is encrypted with the master password.
  async keyringMigrateMasterPassword({ address, password }: RequestMigratePassword): Promise<boolean> {
    return (await this.migrateLegacyAccount(address, password)) === 'migrated';
  }

  // Each pending key of the account that this password opens is migrated on its own. A linked EVM
  // account with a different legacy password stays pending and is listed as its own row.
  private async migrateLegacyAccount(address: string, password: string): Promise<LegacyMigrationResult> {
    const pair = this.getPair(address);

    if (!pair) return 'not_found';

    const ethereumAddress = pair.meta.ethereumAddress as string | undefined;
    const child = ethereumAddress ? this.getPair(ethereumAddress) : null;
    const opened = [...new Set([pair, child])]
      .filter((candidate): candidate is KeyringPair => needsLegacyPasswordMigration(candidate))
      .filter((candidate) => decodesWithPassword(candidate, password));

    if (needsLegacyPasswordMigration(pair) && !opened.includes(pair)) return 'wrong_password';

    try {
      for (const candidate of opened) await upgradeLegacyAccountPassword(candidate, password);
    } catch (e) {
      // Each pair commits on its own. One that failed stays pending and can be retried.
      console.error(e);
    }

    if (needsLegacyPasswordMigration(this.getPair(address))) return 'storage_failed';

    this.scheduleLegacyNetworkEnrollment();

    return 'migrated';
  }

  // For an account in getAccessStatus().issues: a legacy account is migrated with its own old password;
  // a key or TON phrase left under an earlier master password is re-encrypted with the current one.
  // A wrong password writes nothing.
  async recoverAccountWithPassword({
    address,
    walletEcosystem,
    password,
  }: RequestRecoverAccountWithPassword): Promise<ResponseRecoverAccountWithPassword> {
    if (!this.password) return { ok: false, code: 'locked' };

    if (walletEcosystem === WalletEcosystem.Ton) {
      if (!this.tonKeyring.accountSubject.value[address]) return { ok: false, code: 'not_found' };

      try {
        const recovered = await this.tonKeyring.vault.recoverWithPassword(address, password, () => this.password);

        return recovered ? { ok: true } : { ok: false, code: 'wrong_password' };
      } catch (e) {
        console.error(e);

        return { ok: false, code: 'storage_failed' };
      }
    }

    const pair = this.getPair(address);

    if (!pair) return { ok: false, code: 'not_found' };

    if (needsLegacyPasswordMigration(pair)) {
      const result = await this.migrateLegacyAccount(address, password);

      return result === 'migrated' ? { ok: true } : { ok: false, code: result };
    }

    if (!isMasterPasswordPair(pair)) return { ok: false, code: 'not_found' };
    if (!decodesWithPassword(pair, password)) return { ok: false, code: 'wrong_password' };

    try {
      // The same verified copy-and-commit as the legacy upgrade; the record stays a master-password one.
      await upgradeLegacyAccountPassword(pair, password);
    } catch (e) {
      console.error(e);

      return { ok: false, code: 'storage_failed' };
    }

    this.access.clearPreviousMasterPair(address);
    this.scheduleLegacyNetworkEnrollment();

    return { ok: true };
  }

  // For an account in getAccessStatus().issues: the recovery phrase is accepted only if it reproduces
  // the stored address (TON: the stored public key). A mismatch writes nothing.
  async recoverAccountWithPhrase({
    address,
    walletEcosystem,
    phrase,
    derivationPath,
  }: RequestRecoverAccountWithPhrase): Promise<ResponseRecoverAccountWithPhrase> {
    if (!this.password) return { ok: false, code: 'locked' };

    if (walletEcosystem === WalletEcosystem.Ton) {
      if (!this.tonKeyring.accountSubject.value[address]) return { ok: false, code: 'not_found' };

      try {
        const recovered = await this.tonKeyring.vault.recoverWithPhrase(address, phrase, () => this.password);

        return recovered ? { ok: true } : { ok: false, code: 'phrase_mismatch' };
      } catch (e) {
        console.error(e);

        return { ok: false, code: 'storage_failed' };
      }
    }

    const pair = this.getPair(address);

    if (!needsLegacyPasswordMigration(pair) && !isMasterPasswordPair(pair)) return { ok: false, code: 'not_found' };

    const copy = this.pairFromPhrase(pair, phrase, derivationPath);

    if (!copy) return { ok: false, code: 'phrase_mismatch' };

    try {
      await commitMasterEncryptedCopy(pair, copy);
    } catch (e) {
      console.error(e);

      return { ok: false, code: 'storage_failed' };
    }

    this.access.clearPreviousMasterPair(address);
    this.scheduleLegacyNetworkEnrollment();

    return { ok: true };
  }

  // EVM accounts default to the path Fearless creates them with (AddWallet.vue suriEthereum).
  private pairFromPhrase(pair: KeyringPair, phrase: string, derivationPath?: string): KeyringPair | undefined {
    const isEthereum = isEthereumAddress(pair.address);
    let suriPath = derivationPath?.trim() || (isEthereum ? ETHEREUM_DEFAULT_DERIVATION_PATH : '');
    if (isEthereum && !suriPath.startsWith('/')) suriPath = `/${suriPath}`;
    const words = phrase.trim().replace(/\s+/g, ' ');

    for (const candidate of new Set([words, words.toLowerCase()])) {
      if (!candidate) continue;

      try {
        const copy = keyring.createFromUri(`${candidate}${suriPath}`, { ...pair.meta }, pair.type);
        const sameAddress = isEthereum ? isSameString(copy.address, pair.address) : copy.address === pair.address;

        if (sameAddress) return copy;
      } catch {
        // Not a phrase or path for this key type.
      }
    }

    return undefined;
  }
}
