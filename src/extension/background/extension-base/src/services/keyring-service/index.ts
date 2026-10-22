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
import { accountKey } from '@subwallet/ui-keyring/defaults';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import AccountsStore from '@extension-base/stores/Accounts';
import KeyringStore from '@extension-base/stores/KeyringStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { api } from '@sora-substrate/sdk';
import {
  PASSWORD_STORAGE_KEY,
  flushWalletWrites,
  readWalletRecords,
  removeWalletRecords,
  writeWalletRecords,
} from '@extension-base/stores/WalletStorage';
import { tonStore } from '@extension-base/stores/TonStore';
import { TonKeyringService } from './TonKeyring';
import { preparePasswordRecords } from './PasswordChange';
import type { EventService } from '@extension-base/services';
import type {
  DecryptForCosignerData,
  EncryptByCosignerData,
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
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { KeyringAddressType, KeyringItemType, KeyringStore as UIKeyringStore } from '@subwallet/ui-keyring/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';

export type WordCount = 12 | 15 | 18 | 21 | 24;

// Records a wallet reset removes, below the extension prefix: what the keyring library stores (its accountKey,
// addressKey and contractKey) and the TON records. The password verifier is removed with them.
const WALLET_RECORD_PREFIXES = ['account:', 'address:', 'contract:', 'ton:'];

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly tonKeyring = new TonKeyringService(this);
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);

  private password = '';
  private unlockGeneration = 0;
  // Held for the whole of a password change or a reset; unlock, account changes and the other of the two are
  // refused meanwhile.
  private walletRewriteInProgress = false;

  constructor(eventService: EventService) {
    eventService.waitCryptoReady
      .then(() => {
        this.currentAccountStore.get('CurrentAccountInfo', (rs) => {
          rs && this.currentAccountSubject.next(rs);
        });
      })
      .catch(console.error);
  }

  get addressSubject() {
    return addressesObservable.subject;
  }

  get accountSubject() {
    return accountsObservable.subject;
  }

  get hasAccounts() {
    return this.getAllAccounts().length !== 0;
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

  private ensureNoWalletRewrite(): void {
    if (this.walletRewriteInProgress) throw new Error('The wallet is being changed; try again in a moment');
  }

  setCurrentAccount(currentAccountData: CurrentAccountState) {
    this.currentAccountSubject.next(currentAccountData);
    this.currentAccountStore.set('CurrentAccountInfo', currentAccountData);
  }

  loadAll() {
    return keyring.loadAll({
      store: new AccountsStore(),
      type: 'sr25519',
      password_store: IS_EXTENSION ? new KeyringStore() : new KeyringStoreWeb(),
    });
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
    return this.getAllAccounts().filter(({ address }) => !isEthereumAddress(address));
  }

  getAllEthereumAccounts() {
    return this.getAllAccounts().filter(({ address }) => isEthereumAddress(address));
  }

  // return all walletEcosystem accounts [substrate[without ethereum], ton]
  getAllMainAccounts() {
    return [...this.getAllSubstrateAccounts(), ...this.tonKeyring.getAccounts()];
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

  async addAccount(suri: string, meta: FWKeyringMeta, walletEcosystem: WalletEcosystem, type?: KeypairType) {
    this.ensureNoWalletRewrite();

    if (walletEcosystem === 'ton') {
      const account = await this.tonKeyring.createAccount(suri, meta.name!, this.password);

      return account.address.toString();
    }

    // Earlier write failures are not this account's (see confirmSaved).
    await flushWalletWrites().catch(() => undefined);

    const {
      pair: { address },
    } = keyring.addUri(suri, { ...meta, isMobile: false, walletEcosystem: WalletEcosystem.Substrate }, type);

    await this.confirmSaved(address);

    return address;
  }

  // The keyring library only queues an added account's write. Success is reported once it has landed; otherwise the
  // account would be gone after a restart while the user believes it was saved.
  private async confirmSaved(address: string): Promise<void> {
    try {
      await flushWalletWrites();
    } catch {
      keyring.forgetAccount(address);
      await flushWalletWrites().catch(() => undefined);

      throw new Error('The account could not be saved');
    }
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
    this.ensureNoWalletRewrite();
    if (this.tonKeyring.accountSubject.value[address]) return this.tonKeyring.forgetAccount(address);

    return keyring.forgetAccount(address);
  }

  forgetAddress(address: string) {
    return keyring.forgetAddress(address);
  }

  async restoreAccount(file: KeyringPair$Json, password: string, withMasterPassword: boolean = true) {
    this.ensureNoWalletRewrite();
    delete file.meta.genesisHash;
    delete file.meta.isMasterAccount;
    delete file.meta.isMasterPassword;
    delete file.meta.isMobile;

    const ethereumAddress = (file.meta as FWKeyringMeta).ethereumAddress ?? '';

    if (!this.getAccount(ethereumAddress)) delete file.meta.ethereumAddress;

    await flushWalletWrites().catch(() => undefined);

    const pair = keyring.restoreAccount(file, password, withMasterPassword);

    await this.confirmSaved(pair.address);

    return pair;
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

  async saveAccountMeta(address: string, meta: FWKeyringMeta): Promise<void> {
    this.ensureNoWalletRewrite();
    const pair = this.getPair(address);

    if (pair) {
      return this.tonKeyring.withStoreLock(async () => {
        // Serialize read-modify-write metadata updates with password rotation so
        // an older JSON record cannot overwrite freshly encrypted account data.
        const storageKey = `${EXTENSION_PREFIX}:${accountKey(pair.address)}`;
        const records = await readWalletRecords();
        const previous = records[storageKey] as KeyringPair$Json | undefined;

        if (!previous) throw new Error('Stored account not found');

        const updated = { ...previous, meta: { ...previous.meta, ...meta } };

        await writeWalletRecords({ [storageKey]: updated });
        pair.setMeta(updated.meta);
        accountsObservable.add({ set: () => undefined } as unknown as UIKeyringStore, pair.address, updated, pair.type);
      });
    }

    const account = this.getAddress(address);

    if (account) this.saveAddress(address, { ...account.meta, ...meta }, 'address');
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

  async changeMasterPassword({ newPassword, oldPassword }: RequestChangePassword): Promise<boolean> {
    if (this.walletRewriteInProgress) return false;

    this.walletRewriteInProgress = true;
    const generation = ++this.unlockGeneration;
    let committed = false;

    this.password = '';
    keyring.lockAll();

    try {
      return await this.tonKeyring.withStoreLock(async () => {
        // Account and verifier writes the keyring library started earlier must have landed before the snapshot, or
        // one could arrive afterwards, still under the old password. If one of them failed, the change stops here.
        await flushWalletWrites();

        const records = await readWalletRecords();
        const prepared = preparePasswordRecords(records, oldPassword || '', newPassword);
        // Without a stored verifier this sets the first password. TON records can then only be leftovers of a wallet
        // reset by an earlier version; this change neither opens nor rewrites them.
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
        const memoryOnlyStore = { set: () => undefined } as unknown as UIKeyringStore;

        for (const json of prepared.accounts) {
          const pair = keyring.keyring.addFromJson(json, true);

          accountsObservable.add(memoryOnlyStore, pair.address, json, pair.type);
        }

        this.tonKeyring.applyAccounts(tonAccounts);
        keyring.lockAll();

        if (generation === this.unlockGeneration) {
          keyring.unlockKeyring(newPassword);
          this.password = newPassword;
        }

        return true;
      });
    } catch {
      if (generation === this.unlockGeneration) {
        keyring.lockAll();
        this.password = '';
      }

      // Once the batch is stored the new password is in force, whatever failed in memory afterwards. Report the
      // change, with the wallet locked, so it is opened again with the new password; a restart loads the stored state.
      return committed;
    } finally {
      this.walletRewriteInProgress = false;
    }
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

  async exportMnemonic({ address, password, walletEcosystem }: RequestExportSeed): Promise<ResponseExportSeed> {
    if (walletEcosystem === WalletEcosystem.Ton) {
      const seed = await this.tonKeyring.decodeAccountMnemonic(address, password ?? this.password);

      return { seed };
    }

    try {
      const pair = keyring.getPair(address);
      const seed = pair.exportMnemonic(password!);

      return { seed };
    } catch {
      return { seed: '' };
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

  public async accountExportRawSeed(request: RequestExportSeed): Promise<ResponseExportSeed> {
    if (request.isEVM) {
      const { privateKey } = this.accountExportPrivateKey(request);

      return { seed: privateKey };
    }

    const { seed } = await this.exportMnemonic(request);

    if (!seed) return { seed: '' };

    // Convert mnemonic to raw seed (32 bytes for sr25519)
    const seedU8 = mnemonicToMiniSecret(seed);

    // Convert the raw seed in hex format
    const rawSeed = u8aToHex(seedU8);

    return { seed: rawSeed };
  }

  public async accountExportSecretKey(request: RequestExportSeed) {
    const { seed } = await this.exportMnemonic(request);

    if (!seed) return null;

    // Convert mnemonic to raw seed (32 bytes for sr25519)
    const seedU8 = mnemonicToMiniSecret(seed);

    const { secretKey } = sr25519PairFromSeed(seedU8);

    return secretKey;
  }

  async unlockKeyring({ password }: RequestUnlockExtension): Promise<boolean | 'ton-recovery-required'> {
    if (this.walletRewriteInProgress) return false;

    const generation = ++this.unlockGeneration;

    this.password = '';
    keyring.lockAll();

    try {
      keyring.unlockKeyring(password);
      keyring.lockAll();

      try {
        await this.tonKeyring.migrateOnUnlock(password);
      } catch {
        // The TON records stay exactly as stored and the upgrade runs again at the next unlock. It must never keep
        // the user out of the wallet.
        console.error('TON storage upgrade did not complete');
      }

      if (generation !== this.unlockGeneration) return false;

      keyring.unlockKeyring(password);
      this.password = password;

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

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  // Removes the whole wallet - verifier, accounts, address book and TON records - in one storage operation, so a
  // storage failure leaves it as it was. Memory is cleared only after that operation has succeeded.
  async resetWallet(): Promise<boolean> {
    if (this.walletRewriteInProgress) return false;

    // Nothing may write a verifier or an account between the records being read and removed below.
    this.walletRewriteInProgress = true;
    this.unlockGeneration += 1;
    this.password = '';
    keyring.lockAll();

    let committed = false;

    try {
      await this.tonKeyring.reset(async () => {
        // Let writes the keyring library started earlier land first, so none recreates a record afterwards. One that
        // failed does not matter here: everything goes.
        await flushWalletWrites().catch(() => undefined);

        const prefixes = WALLET_RECORD_PREFIXES.map((prefix) => `${EXTENSION_PREFIX}:${prefix}`);
        const keys = Object.keys(await readWalletRecords()).filter(
          (key) => key === PASSWORD_STORAGE_KEY || prefixes.some((prefix) => key.startsWith(prefix))
        );

        await removeWalletRecords(keys);
        committed = true;
      });

      // The stored wallet is gone; now clear the keyring's memory. The removals it queues find nothing left.
      keyring.resetWallet(true);
      await flushWalletWrites().catch(() => undefined);

      return true;
    } catch (e) {
      console.error(e);

      // Once the records are removed the wallet is gone, whatever failed in memory afterwards. Report it; the wallet
      // stays locked, and a restart loads the empty storage.
      return committed;
    } finally {
      this.walletRewriteInProgress = false;
    }
  }

  getMigrationAccounts() {
    return this.getAccounts()
      .map(({ address }) => this.getPair(address)!)
      .filter(({ type }) => type !== 'ethereum')
      .filter(({ meta: { isMasterPassword } }) => !isMasterPassword);
  }

  isNeedMigration(): boolean {
    return this.getMigrationAccounts().length !== 0;
  }

  keyringMigrateMasterPassword({ address, password }: RequestMigratePassword): boolean {
    this.ensureNoWalletRewrite();

    try {
      const account = this.getAccount(address);
      const meta = account?.meta as FWKeyringMeta;
      const ethereumAddress = meta.ethereumAddress;

      keyring.migrateWithMasterPassword(address, password);

      if (ethereumAddress) keyring.migrateWithMasterPassword(ethereumAddress, password);

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  async decryptForCosigner({ address, data, encryptorPublicKey }: DecryptForCosignerData) {
    const pair = this.getPair(address);

    if (!pair) throw new Error('Key pair not exist');

    const secretKey = await this.accountExportSecretKey({ address, password: this.password });

    if (secretKey === null) throw new Error('Seckret key is undefined');

    return api.crypto.decryptForCosigner(address, encryptorPublicKey, data, secretKey);
  }

  async encryptByCosigner({ address, data, cosigners }: EncryptByCosignerData) {
    if (this.password === '') throw new Error('First unlock the extension');

    const pair = this.getPair(address);

    if (!pair) throw new Error('Key pair not exist');

    const secretKey = await this.accountExportSecretKey({ address, password: this.password });

    if (secretKey === null) throw new Error('Seckret key is undefined');

    const _cosigners = Object.fromEntries(Object.entries(cosigners).map(([key, value]) => [key, hexToU8a(value)]));

    return api.crypto.encryptBySigner(data, _cosigners, secretKey);
  }
}
