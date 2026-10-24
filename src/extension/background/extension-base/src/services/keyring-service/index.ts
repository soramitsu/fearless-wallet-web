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
import WalletConnectRetiredSessions, { sessionIsApproved } from '@extension-base/stores/WalletConnectRetiredSessions';
import CurrentAccountStore, { CurrentAccountContextChanged, type CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { keyring } from '@subwallet/ui-keyring';
import AccountsStore from '@extension-base/stores/Accounts';
import { ecdsaPairKeys } from '@extension-base/stores/EcdsaAccountRecords';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import KeyringStore from '@extension-base/stores/KeyringStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { WEB_PASSWORD_RECORD_KEY } from '@extension-base/stores/WebPasswordRecord';
import { api as soraSdk } from '@sora-substrate/sdk';
import { TonKeyringService } from './TonKeyring';
import { commitMasterEncryptedCopy, upgradeLegacyAccountPassword } from './LegacyPasswordUpgrade';
import { alreadyPersistedAccountStore, isCurrentAccountPair, updateAccountMetadata } from './AccountMetadata';
import { removePublicAddress, updatePublicAddress, type PublicAddressUpdateOptions } from './AddressMetadata';
import { importLocalAccount } from './LocalAccountImport';
import { decodeJsonAccount } from './JsonAccountImport';
import { walletResetMutation } from './WalletReset';
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
  accountStoreKey,
  deletedWalletId,
  deletedWalletKey,
  readDeletedWallet,
  summarizeDeletedWallets,
  walletAddressIdentity,
  walletRecordKeys,
  type DeletedWallet,
} from './DeletedWallets';
import { commitMasterPasswordChange } from './MasterPasswordChange';
import { WalletSecurityProvenance, withoutWalletSecurityClaims } from './WalletSecurityProvenance';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
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
  private walletSecurityProvenance?: WalletSecurityProvenance;

  private get securityProvenance(): WalletSecurityProvenance {
    return this.walletSecurityProvenance ??= new WalletSecurityProvenance();
  }

  getAccountCreationMeta(suri: string, meta: FWKeyringMeta, requireFreshGeneration = false): FWKeyringMeta {
    return this.securityProvenance.accountMetadata(suri, meta, requireFreshGeneration);
  }
  private authenticationRevision = 0;
  private selectionRevision = 0;
  private selectionRequestRevision = 0;
  private enrollmentEpoch = 0;
  private enrollmentWork: Promise<void> = Promise.resolve();
  private enrollmentGate: (address: string) => boolean = () => true;
  private resetting = false;
  private resetRevision = 0;
  private resetWork?: Promise<boolean>;

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
    if (!this.password || (!IS_EXTENSION && KeyringStoreWeb.readOnly)) return;
    const password = this.password;
    const epoch = (this.enrollmentEpoch ?? 0) + 1;
    this.enrollmentEpoch = epoch;
    const isCurrent = () => this.enrollmentEpoch === epoch && this.password === password &&
      (IS_EXTENSION || !KeyringStoreWeb.readOnly);
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
    // Concurrent startup retries are reads, not competing user choices.
    const request = this.selectionRequestRevision ?? 0;
    const currentAccount = await this.currentAccountStore.readSelection();
    // A cancelled mobile selection whose compensation failed cannot regain
    // authority after worker restart, even if the SDK retains its old session.
    const retired = currentAccount?.isMobile && currentAccount.wcTopic &&
      !sessionIsApproved(await new WalletConnectRetiredSessions().readPolicy(), currentAccount.wcTopic);
    if (this.selectionRequestRevision !== request) return;
    if (retired) {
      if (!IS_EXTENSION && KeyringStoreWeb.readOnly) {
        this.selectionRevision = this.currentAccountRevision + 1;
        this.currentAccountSubject.next(null);
        return;
      }
      await this.setCurrentAccount(null, undefined, () => {});
      return;
    }
    this.selectionRevision = this.currentAccountRevision + 1;
    this.currentAccountSubject.next(currentAccount);
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

  get currentAccountRevision(): number {
    return this.selectionRevision ?? 0;
  }

  get isResetting(): boolean {
    return !!this.resetting;
  }

  get walletResetRevision(): number {
    return this.resetRevision ?? 0;
  }

  private removingAccounts = new Set<string>();
  private removalRevisions = new Map<string, number>();

  private async withAccountRemoval(
    addresses: string[], beforeRemoval: (() => Promise<void>) | undefined, operation: () => Promise<void>
  ): Promise<void> {
    const identities = addresses.map(walletAddressIdentity);
    this.removingAccounts ??= new Set();
    this.removalRevisions ??= new Map();
    for (const address of identities) {
      this.removingAccounts.add(address);
      this.removalRevisions.set(address, (this.removalRevisions.get(address) ?? 0) + 1);
    }
    try {
      await beforeRemoval?.();
      // The handler supplies State's callback to clear Sora/context too. Direct
      // service callers still cannot leave a removed wallet selected.
      if (identities.includes(walletAddressIdentity(this.currentAccountSubject?.value?.address ?? ''))) await this.setCurrentAccount(null);
      await operation();
    } finally {
      identities.forEach((address) => this.removingAccounts.delete(address));
    }
  }

  async setCurrentAccount(
    currentAccountData: CurrentAccountState,
    onCommitted?: (account: CurrentAccountState) => void,
    assertCurrent?: () => void,
    onRecoveryState?: (account: CurrentAccountState) => void
  ): Promise<void> {
    const address = currentAccountData?.address ? walletAddressIdentity(currentAccountData.address) : undefined;
    const resetRevision = this.resetRevision ?? 0;
    const removalRevision = address ? this.removalRevisions?.get(address) ?? 0 : 0;
    const assertAvailable = () => {
      if (address && (this.resetting || (this.resetRevision ?? 0) !== resetRevision ||
        this.removingAccounts?.has(address) || (this.removalRevisions?.get(address) ?? 0) !== removalRevision))
        throw new CurrentAccountContextChanged();
    };
    assertAvailable();
    const previous = this.currentAccountSubject.value;
    const request = (this.selectionRequestRevision ?? 0) + 1;
    this.selectionRequestRevision = request;
    // A pending choice invalidates earlier selection-bound work immediately.
    this.selectionRevision = this.currentAccountRevision + 1;
    const publish = (value: CurrentAccountState) => {
      this.selectionRevision = this.currentAccountRevision + 1;
      this.currentAccountSubject.next(value);
    };
    await this.currentAccountStore.select(currentAccountData, (committed) => {
      publish(committed);
      onCommitted?.(committed);
    }, () => {
      assertAvailable();
      if (assertCurrent) {
        if (this.selectionRequestRevision !== request || this.currentAccountSubject.value !== previous)
          throw new CurrentAccountContextChanged();
        assertCurrent();
      }
    }, () => {
      publish(null);
      onRecoveryState?.(null);
    }, (value) => {
      if (this.currentAccountSubject.value !== previous) {
        publish(value);
        onRecoveryState?.(value);
      }
    });
  }

  settleCurrentAccount(): Promise<void> {
    return this.currentAccountStore.settleSelection();
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
    tonImport?: TonImportChoice | boolean,
    requireFreshGeneration = false
  ) {
    if (typeof tonImport === 'boolean') requireFreshGeneration = tonImport;
    meta = this.getAccountCreationMeta(suri, meta, requireFreshGeneration);
    if (walletEcosystem === 'ton') {
      const account = await this.tonKeyring.createAccount(suri, meta, typeof tonImport === 'object' ? tonImport : undefined);

      return account.address.toString();
    }

    return this.tonKeyring.vault.exclusive(async () => {
      const pair = keyring.createFromUri(suri, { ...meta, isMobile: false, walletEcosystem }, type);
      const effectiveEcosystem = isEthereumAddress(pair.address) ? WalletEcosystem.Evm : walletEcosystem;
      return importLocalAccount(pair, effectiveEcosystem, () => this.password);
    });
  }

  saveAddress(address: string, meta: FWKeyringMeta, type: KeyringAddressType, options: PublicAddressUpdateOptions = {}) {
    const snapshot = structuredClone(meta);
    const resetRevision = this.resetRevision ?? 0;
    const admittedDuringReset = this.resetting;
    return updatePublicAddress(address, type, (current) => ({
      ...current, ...snapshot, walletEcosystem: WalletEcosystem.Substrate,
    }), { ...options, assertCurrent: () => {
      if (admittedDuringReset || this.resetting || (this.resetRevision ?? 0) !== resetRevision) throw new CurrentAccountContextChanged();
      options.assertCurrent?.();
    } });
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

  forgetAccount(address: string, beforeRemoval?: () => Promise<void>, assertCurrent?: () => void): Promise<void> {
    return this.archiveWallet(address, true, beforeRemoval, assertCurrent);
  }

  forgetAddress(address: string, beforeRemoval?: () => Promise<void>, assertCurrent?: () => void): Promise<void> {
    return this.tonKeyring.vault.exclusive(() => this.withAccountRemoval(
      [address], beforeRemoval, () => removePublicAddress(address, assertCurrent)
    ));
  }

  /**
   * Keeps every stored record that holds this wallet's keys (its account, its linked Ethereum account, the records an
   * ECDSA account had before, its TON phrase) exactly as stored, in one entry Account access can restore
   * (DeletedWallets.ts). Settles once that entry is written and rejects if it is not, so a wallet is deleted only
   * when its keys are kept.
   */
  async archiveWallet(address: string, remove = false, beforeRemoval?: () => Promise<void>, assertCurrent?: () => void): Promise<void> {
    // Import, password rotation and TON repair share this queue; metadata shares
    // the underlying storage queue. No newer key can arrive between snapshot and removal.
    await this.tonKeyring.vault.exclusive(async () => {
      const store = this.accountsStore ?? new AccountsStore();
      const ton = this.tonKeyring.accountSubject.value[address];
      const pair = ton ? null : this.getPair(address);
      const ethereumAddress = pair?.meta.ethereumAddress as string | undefined;
      const ethereumPair = ethereumAddress ? this.getPair(ethereumAddress) : null;
      const pairs = [...new Set([pair, ethereumPair].filter((candidate): candidate is KeyringPair => !!candidate))];
      const accountKeys = walletRecordKeys(pairs);
      const keys = [...accountKeys, ...(ton ? [`ton:${address}`] : [])];
      if (!keys.length) return;
      const persist = () => store.mutateRecordsAndWait(keys, (current) => {
        assertCurrent?.();
        if (pairs.some((candidate) => !isCurrentAccountPair(candidate)) ||
          (ton && !this.tonKeyring.accountSubject.value[address]))
          throw new Error('Wallet changed before removal.');
        // A live private key without its durable primary record is not safe to delete.
        if (pairs.some((candidate) => !current[accountStoreKey(candidate)]) || (ton && !current[`ton:${address}`]))
          throw new Error('Wallet recovery record is missing.');
        if (pair && (current[accountStoreKey(pair)] as KeyringPair$Json).meta.ethereumAddress !== ethereumAddress)
          throw new Error('Linked wallet changed before removal.');
        const accounts = Object.fromEntries(accountKeys.filter((key) => current[key] !== undefined)
          .map((key) => [key, current[key]]));
        const tonRecord = current[`ton:${address}`] as TonStoreAccount | undefined;
        const meta = (pair ? (current[accountStoreKey(pair)] as KeyringPair$Json).meta : {}) as FWKeyringMeta;
        const deletedAt = Date.now();
        const wallet: DeletedWallet = {
          address, name: tonRecord?.name ?? (typeof meta.name === 'string' ? meta.name : ''),
          walletEcosystem: ton ? WalletEcosystem.Ton : meta.walletEcosystem ?? WalletEcosystem.Substrate,
          deletedAt, accounts, ...(tonRecord ? { ton: tonRecord } : {}),
        };
        // Repeated attempts may leave an extra recovery copy after a failed Chrome
        // removal. Never replace an older copy, even in the same millisecond.
        const id = `${deletedWalletId(address, deletedAt)}:${crypto.randomUUID()}`;
        return { entries: { [deletedWalletKey(id)]: wallet }, remove: remove ? keys : [] };
      }, () => {
        if (!remove) return;
        for (const candidate of pairs) {
          if (!isCurrentAccountPair(candidate)) continue;
          candidate.lock();
          keyring.keyring.removePair(candidate.address);
          keyring.accounts.removeSubjectOnly(candidate.address);
        }
        if (ton) this.tonKeyring.removeAccountFromMemory(address);
      });
      if (remove) await this.withAccountRemoval([...pairs.map((candidate) => candidate.address), ...(ton ? [address] : [])], beforeRemoval, persist);
      else await persist();
    });
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
    return this.tonKeyring.vault.exclusive(async () => {
      try {
        return await this.writeBackDeletedWallet(id);
      } catch (error) {
        console.error(error);
        return { ok: false, code: 'storage_failed' };
      }
    });
  }

  private async writeBackDeletedWallet(id: string): Promise<ResponseRestoreDeletedWallet> {
    const store = this.accountsStore ?? new AccountsStore();
    const key = deletedWalletKey(id);
    const wallet = readDeletedWallet(await store.getAndWait(key));

    if (!wallet) return { ok: false, code: 'not_found' };
    if (this.isInWallet(wallet.address)) return { ok: false, code: 'already_in_wallet' };

    // Prepare detached pairs before removing the recovery copy. Publication below never
    // calls ui-keyring.loadAccount: that would enqueue another unacknowledged store write.
    const prepared = Object.entries(wallet.accounts).flatMap(([storageKey, record]) => {
      // Earlier ECDSA copies remain inert, exactly as stored. Every account entry
      // that a keyring can load must validate, including legacy account-id keys.
      if (/^archivedAccount:0x[0-9a-f]{64}$/.test(storageKey)) return [];
      if (!/^account:0x[0-9a-f]+$/.test(storageKey) || !record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('Recovery copy contains an invalid account record.');
      }
      const json = record as KeyringPair$Json;
      if (typeof json.encoded !== 'string' || !json.encoded || !json.meta || typeof json.meta !== 'object' || Array.isArray(json.meta)) {
        throw new Error('Recovery copy contains an invalid encrypted account.');
      }
      const pair = keyring.createFromJson(json);
      if (json.meta.isTesting || (accountStoreKey(pair) !== storageKey && ecdsaPairKeys(pair)?.legacy !== storageKey)) {
        throw new Error('Recovery account does not match its storage identity.');
      }
      return ecdsaPairKeys(pair)?.legacy === storageKey ? [] : [{ pair, json }];
    });
    if (!wallet.ton && !prepared.some(({ pair }) => walletAddressIdentity(pair.address) === walletAddressIdentity(wallet.address))) {
      throw new Error('Recovery copy has no primary wallet key.');
    }
    if (wallet.ton) {
      if (!/^[0-9a-f]{64}$/i.test(wallet.ton.publicKeyHex) || !wallet.ton.cipherSeed) {
        throw new Error('Recovery copy has an invalid TON key.');
      }
      const contract = this.tonKeyring.createContractV4(hexToU8a(`0x${wallet.ton.publicKeyHex}`));
      if (this.tonKeyring.getUserFriendlyAddress(contract.address) !== wallet.address) {
        throw new Error('Recovery TON key does not match its address.');
      }
    }
    const records = { ...wallet.accounts, ...(wallet.ton ? { [`ton:${wallet.address}`]: wallet.ton } : {}) };
    let conflict: 'not_found' | 'already_in_wallet' | undefined;
    await store.mutateRecordsAndWait([key, ...Object.keys(records)], (current) => {
      if (current[key] === undefined) {
        conflict = 'not_found';
        return { entries: {}, remove: [] };
      }
      if (JSON.stringify(current[key]) !== JSON.stringify(wallet)) {
        throw new Error('Recovery copy changed. Retry with the current copy.');
      }
      // A prior failed archive removal may have written identical records without
      // publishing them. Reuse only those exact copies; never overwrite another wallet.
      if (this.isInWallet(wallet.address) || prepared.some(({ pair }) => this.isInWallet(pair.address)) ||
        Object.entries(records).some(([recordKey, record]) => current[recordKey] !== undefined &&
          JSON.stringify(current[recordKey]) !== JSON.stringify(record))) {
        conflict = 'already_in_wallet';
        return { entries: {}, remove: [] };
      }
      return { entries: Object.fromEntries(Object.entries(records).filter(([recordKey]) => current[recordKey] === undefined)), remove: [key] };
    }, () => {
      if (conflict) return;
      for (const { pair, json } of prepared) {
        keyring.keyring.addPair(pair);
        keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
      }
      if (wallet.ton) this.tonKeyring.setAccounts({ ...wallet.ton, address: wallet.address });
    });
    if (conflict) return { ok: false, code: conflict };
    // An older encrypted key remains recoverable with its earlier password.
    if (this.password) this.access.scheduleScan(this.password);
    return { ok: true, address: wallet.address, name: wallet.name, walletEcosystem: wallet.walletEcosystem };
  }

  async restoreAccount(file: KeyringPair$Json, password: string, linkedEthereumAddress?: string): Promise<{ address: string }> {
    // Capture the caller's backup before waiting; never mutate its encrypted recovery copy.
    const json = structuredClone(file);
    json.meta = withoutWalletSecurityClaims(json.meta as FWKeyringMeta);
    return this.tonKeyring.vault.exclusive(async () => {
      if (!this.password || keyring.keyring.isLocked) throw new Error('Wallet locked. Unlock and retry.');
      const pair = decodeJsonAccount(json, password);
      try {
        if (linkedEthereumAddress) {
          // Only an explicit restore request may link a separately selected/imported EVM key.
          // Passive backup metadata cannot hide an unrelated existing wallet from the list.
          if (pair.type === 'ethereum' || !isEthereumAddress(linkedEthereumAddress)) throw new Error('Invalid linked Ethereum account.');
          const linked = this.getPair(linkedEthereumAddress);
          if (!linked || linked.type !== 'ethereum') throw new Error('Linked Ethereum account is unavailable.');
          const saved = await new AccountsStore().getAndWait(`account:${linkedEthereumAddress.toLowerCase()}`);
          if (!saved || ['isExternal', 'isHardware', 'isInjected', 'isMobile'].some((flag) => saved.meta[flag])) {
            throw new Error('Linked Ethereum account is not stored locally.');
          }
          const verified = decodeJsonAccount(saved, this.password);
          try {
            if (verified.address.toLowerCase() !== linkedEthereumAddress.toLowerCase()) throw new Error('Linked Ethereum account changed.');
            pair.setMeta({ ethereumAddress: verified.address });
          } finally { verified.lock(); }
        }
        const ecosystem = pair.type === 'ethereum' ? WalletEcosystem.Evm : WalletEcosystem.Substrate;
        return { address: await importLocalAccount(pair, ecosystem, () => this.password) };
      } finally { pair.lock(); }
    });
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
    meta = withoutWalletSecurityClaims(meta);
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
      const snapshot = structuredClone(meta);
      return updatePublicAddress(address, 'address', (current) =>
        withUniversalWalletKeyringMeta(address, { ...current, ...snapshot },
          snapshot.walletEcosystem ?? current.walletEcosystem ?? WalletEcosystem.Substrate), { requireExisting: true });
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
    if (this.resetWork || this.resetting) return false;
    const resetRevision = this.resetRevision ?? 0;
    const revision = this.authenticationRevision ?? 0;
    const assertCurrent = () => {
      if (this.resetting || (this.resetRevision ?? 0) !== resetRevision ||
        (this.authenticationRevision ?? 0) !== revision) throw new Error('Wallet authentication changed during password change.');
    };
    return this.tonKeyring.vault.exclusive(async () => {
      if (!newPassword) return false;
      try {
        await flushWalletWrites();
        assertCurrent();
        const pairs = this.getAccounts().map(({ address }) => this.getPair(address))
          .filter((pair): pair is KeyringPair => !!pair);
        const retained = await commitMasterPasswordChange(pairs, this.tonKeyring, this.hasMasterPassword,
          oldPassword, newPassword, assertCurrent, password => {
            if ((this.authenticationRevision ?? 0) !== revision) { this.password = ''; return false; }
            this.password = password;
            return true;
          });
        retained.forEach(address => this.access.flagPreviousMasterPair(address));
        this.scheduleLegacyNetworkEnrollment();
        this.access.scheduleScan(newPassword);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    });
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

  // `pri(keyring.export.mnemonic)`. A TON phrase is returned exactly as stored, only after it derived the
  // account's public key, and never empty: a phrase that does not open throws its recovery code.
  async exportAccountMnemonic(request: RequestExportSeed): Promise<ResponseExportSeed> {
    if (request.walletEcosystem !== WalletEcosystem.Ton) return this.exportMnemonic(request);
    if (!IS_EXTENSION && KeyringStoreWeb.readOnly) {
      // Emergency export verifies the supplied account password against the stored
      // public key, including a previous password. The vault cannot repair storage here.
      if (!request.password) throw new TonKeyringError('wrong_password');
      return { seed: await this.tonKeyring.vault.decryptVerified(request.address, () => request.password!) };
    }
    if (request.password !== undefined && request.password !== this.password) throw new TonKeyringError('wrong_password');

    return { seed: await this.tonKeyring.decodeMnemonicVerified(request.address) };
  }

  // Keyring accounts only; TON phrases are verified asynchronously by exportAccountMnemonic.
  exportMnemonic({ address, password, walletEcosystem }: RequestExportSeed): ResponseExportSeed {
    if (walletEcosystem === WalletEcosystem.Ton) throw new TonKeyringError('ton_export_requires_verification');

    const passphrase = password ?? this.password;
    const accountPair = this.getPair(address);

    if (accountPair?.meta.isMnemonicUnverified) {
      throw new Error('This backup does not establish a recovery phrase for this account. Use its encrypted JSON backup.');
    }

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
      this.authenticationRevision = (this.authenticationRevision ?? 0) + 1;
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
      this.authenticationRevision = (this.authenticationRevision ?? 0) + 1;

      this.password = '';
      this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
      this.access.cancelScan();

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  resetWallet(beforeReset?: () => Promise<void>): Promise<boolean> {
    if (this.resetWork) return this.resetWork;
    const work = this.tonKeyring.vault.exclusive(async () => {
      this.resetting = true;
      this.resetRevision = (this.resetRevision ?? 0) + 1;
      this.enrollmentEpoch = (this.enrollmentEpoch ?? 0) + 1;
      let committed = false;
      try {
        await beforeReset?.();
        // The handler clears State/Sora too. Direct callers still acknowledge
        // durable empty selection, including a stale stored selection at startup.
        if (!beforeReset || this.currentAccountSubject.value) await this.setCurrentAccount(null);
        const pairs = Object.keys(this.accountSubject.value).map((address) => this.getPair(address))
          .filter((pair): pair is KeyringPair => !!pair);
        const store = this.accountsStore ?? new AccountsStore();
        if (!IS_EXTENSION) {
          await KeyringStoreWeb.flush();
          await KeyringStoreWeb.removeForReset();
        }
        await store.mutateRecordsAndWait(null, (current) => {
          const mutation = walletResetMutation(current, pairs);
          if (!IS_EXTENSION) mutation.entries[WEB_PASSWORD_RECORD_KEY] = { version: 1, serialized: null };
          return mutation;
        }, () => {
          committed = true;
          // Memory changes only after storage acknowledges every archive/removal.
          try {
            for (const pair of pairs) { pair.lock(); keyring.keyring.removePair(pair.address); }
            for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
              Object.keys(subject.subject.value).forEach((address) => subject.removeSubjectOnly(address));
            }
            keyring.keyring.resetPassword();
            if (!IS_EXTENSION) KeyringStoreWeb.commitReset();
          } finally {
            this.password = '';
            this.access.reset();
          }
        });
        return true;
      } catch (error) {
        console.error(error);
        // Once storage has archived and removed the wallet the reset is done, whatever failed in memory after it.
        // Reported with the wallet locked, as in 3.0.6: a retry would find no stored record for the keys still in
        // memory, and a restart reads the stored state.
        return committed;
      } finally {
        this.resetting = false;
      }
    });
    this.resetWork = work;
    void work.finally(() => { if (this.resetWork === work) this.resetWork = undefined; }).catch(() => {});
    return work;
  }

  private getLegacyPasswordPairs(): KeyringPair[] {
    return this.getAccounts()
      .map(({ address }) => this.getPair(address))
      .filter((pair): pair is KeyringPair => needsLegacyPasswordMigration(pair));
  }

  getMigrationAccounts(): LegacyPasswordAccountSummary[] {
    return summarizeLegacyPasswordAccounts(this.getLegacyPasswordPairs(), this.getAccounts());
  }

  async getAccessStatus(): Promise<AccountAccessStatus> {
    const status = await this.access.getStatus(this.getLegacyPasswordPairs());
    if (IS_EXTENSION || !KeyringStoreWeb.readOnly) return status;
    return { ...status, storageRecoveryOnly: true, storageRecoveryAccounts: [
      ...this.getAccounts().filter(({ meta }) =>
        !['isMobile', 'isExternal', 'isHardware', 'isInjected'].some(flag => meta[flag])
      ).map(({ address, meta }) => ({ address, name: meta.name ?? '',
        walletEcosystem: isEthereumAddress(address) ? WalletEcosystem.Evm : WalletEcosystem.Substrate })),
      ...Object.entries(this.tonKeyring.accountSubject.value).map(([address, account]) => ({
        address, name: account.name ?? '', walletEcosystem: WalletEcosystem.Ton,
      })),
    ] };
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
    if (this.resetWork || this.resetting) return false;
    const resetRevision = this.resetRevision ?? 0;
    return this.tonKeyring.vault.exclusive(async () => {
      if (!this.password || this.resetting || (this.resetRevision ?? 0) !== resetRevision) return false;
      return (await this.migrateLegacyAccount(address, password)) === 'migrated';
    });
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
    if (this.resetWork || this.resetting) return { ok: false, code: 'storage_failed' };
    const resetRevision = this.resetRevision ?? 0;

    if (walletEcosystem === WalletEcosystem.Ton) {
      if (!this.tonKeyring.accountSubject.value[address]) return { ok: false, code: 'not_found' };

      try {
        const result = await this.tonKeyring.vault.recoverWithPassword(address, password, () => this.password);

        return result === 'recovered' ? { ok: true } : { ok: false, code: result };
      } catch (e) {
        console.error(e);

        return { ok: false, code: 'storage_failed' };
      }
    }

    // Native recovery shares password/reset ordering with TON and imports. The
    // current master password is read only after earlier changes have committed.
    return this.tonKeyring.vault.exclusive(async () => {
      if (!this.password || keyring.keyring.isLocked) return { ok: false, code: 'locked' };
      if (this.resetting || (this.resetRevision ?? 0) !== resetRevision) return { ok: false, code: 'storage_failed' };
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

      if (!this.password || keyring.keyring.isLocked) return { ok: false, code: 'locked' };
      this.access.clearPreviousMasterPair(address);
      this.scheduleLegacyNetworkEnrollment();

      return { ok: true };
    });
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
    if (this.resetWork || this.resetting) return { ok: false, code: 'storage_failed' };
    const resetRevision = this.resetRevision ?? 0;

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

    // Native recovery shares password/reset ordering with TON and imports. The
    // current master password is read only after earlier changes have committed.
    return this.tonKeyring.vault.exclusive(async () => {
      if (!this.password || keyring.keyring.isLocked) return { ok: false, code: 'locked' };
      if (this.resetting || (this.resetRevision ?? 0) !== resetRevision) return { ok: false, code: 'storage_failed' };
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

      if (!this.password || keyring.keyring.isLocked) return { ok: false, code: 'locked' };
      this.access.clearPreviousMasterPair(address);
      this.scheduleLegacyNetworkEnrollment();

      return { ok: true };
    });
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
