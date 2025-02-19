import {
  isEthereumAddress,
  base64Decode,
  mnemonicToMiniSecret,
  mnemonicGenerate,
  mnemonicValidate,
} from '@polkadot/util-crypto';
import { accounts as accountsObservable } from '@subwallet/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@subwallet/ui-keyring/observable/addresses';
import { BehaviorSubject } from 'rxjs';
import CurrentAccountStore, { type CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { u8aToHex } from '@polkadot/util';
import { keyring } from '@subwallet/ui-keyring';
import AccountsStore from '@extension-base/stores/Accounts';
import KeyringStore from '@extension-base/stores/KeyringStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { TonKeyringService } from './TonKeyring';
import type { EventService } from '@extension-base/services';
import type {
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
import type { KeyringAddressType, KeyringItemType } from '@subwallet/ui-keyring/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';

export type WordCount = 12 | 15 | 18 | 21 | 24;

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly tonKeyring = new TonKeyringService(this);
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);

  private password = '';

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
    if (walletEcosystem === 'ton') {
      const account = await this.tonKeyring.createAccount(suri, meta.name!, this.password);

      return account.address.toString();
    }

    const {
      pair: { address },
    } = keyring.addUri(suri, { ...meta, isMobile: false, walletEcosystem: WalletEcosystem.Substrate }, type);

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
    if (this.tonKeyring.accountSubject.value[address]) this.tonKeyring.forgetAccount(address);
    else keyring.forgetAccount(address);
  }

  forgetAddress(address: string) {
    return keyring.forgetAddress(address);
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

  saveAccountMeta(address: string, meta: FWKeyringMeta) {
    const pair = this.getPair(address);

    if (pair) return keyring.saveAccountMeta(pair, { ...pair.meta, ...meta });

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

  getDataAccounts({ address, walletEcosystem }: RequestExportSeed) {
    if (walletEcosystem === WalletEcosystem.Ton) {
      const { cipherSeed } = this.tonKeyring.accountSubject.value[address];
      const value = this.tonKeyring.decode(cipherSeed);

      return { value };
    }

    try {
      const pair = keyring.getPair(address);
      const value = pair.exportMnemonic(this.password);

      return { value };
    } catch (err) {
      console.info();
    }

    try {
      const pair = keyring.getPair(address);
      const value1 = this.backupAccount(address, this.password);
      let value2;

      if ((pair.meta as any)?.ethereumAddress) {
        value2 = this.backupAccount((pair.meta as any).ethereumAddress, this.password);
      }

      return {
        value: `${JSON.stringify(value1)}_${this.password}`,
        value2: value2 ? `${JSON.stringify(value2)}_${this.password}` : undefined,
      };
    } catch {
      return { value: '' };
    }
  }

  changeMasterPassword({ newPassword, oldPassword }: RequestChangePassword): boolean {
    try {
      this.password = newPassword;

      keyring.changeMasterPassword(newPassword, oldPassword);

      return true;
    } catch (e) {
      console.error(e);

      return false;
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

  exportMnemonic({ address, password, walletEcosystem }: RequestExportSeed): ResponseExportSeed {
    if (walletEcosystem === WalletEcosystem.Ton) {
      const { cipherSeed } = this.tonKeyring.accountSubject.value[address];
      const seed = this.tonKeyring.decodeMnemonic(cipherSeed);

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

  unlockKeyring({ password }: RequestUnlockExtension): boolean {
    try {
      this.password = password;

      keyring.unlockKeyring(password);

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

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  resetWallet(): boolean {
    try {
      keyring.resetWallet(true);

      return true;
    } catch (e) {
      console.error(e);

      return false;
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
}
