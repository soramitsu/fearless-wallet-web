import { keyring } from '@polkadot/ui-keyring';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@polkadot/ui-keyring/observable/addresses';
import { BehaviorSubject } from 'rxjs';
import CurrentAccountStore, { type CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { type EventService } from '@extension-base/services';
import { type RequestExportMnemonic, type ResponseExportMnemonic } from '../../background/types/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { KeyringAddressType, KeyringItemType, KeyringStore } from '@polkadot/ui-keyring/types';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import { isSameString } from '@/helpers';

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);

  constructor(eventService: EventService) {
    eventService.waitCryptoReady
      .then(() => {
        this.currentAccountStore.get('CurrentAccountInfo', (rs) => {
          rs && this.currentAccountSubject.next(rs);
        });
      })
      .catch(console.error);
  }

  get currentAccount(): CurrentAccountState {
    return this.currentAccountSubject.value;
  }

  get addressSubject() {
    return addressesObservable.subject;
  }

  get accountSubject() {
    return accountsObservable.subject;
  }

  get addressesSubjectValue() {
    return keyring.addresses.subject.value;
  }

  get accountSubjectValue() {
    return keyring.accounts.subject.value;
  }

  setCurrentAccount(currentAccountData: CurrentAccountState) {
    this.currentAccountSubject.next(currentAccountData);
    this.currentAccountStore.set('CurrentAccountInfo', currentAccountData);
  }

  loadAll(store: KeyringStore, type: KeypairType = 'sr25519') {
    return keyring.loadAll({
      store,
      type,
    });
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

  getAccounts() {
    return keyring.getAccounts();
  }

  getAddresses() {
    return keyring.getAddresses();
  }

  triggerWalletsSubscription(): boolean {
    const accountsSubject = accountsObservable.subject;
    const addressSubject = addressesObservable.subject;

    accountsSubject.next(accountsSubject.getValue());
    addressSubject.next(addressSubject.getValue());

    return true;
  }

  addAccount(suri: string, password: string, meta: FWKeyringMeta, type?: KeypairType) {
    const {
      pair: { address },
    } = keyring.addUri(suri, password, { ...meta, isMobile: false }, type);

    return address;
  }

  saveAddress(address: string, meta: FWKeyringMeta, type: KeyringAddressType) {
    keyring.saveAddress(address, meta, type);
  }

  backupAccount(address: string, password: string) {
    const pair = this.getPair(address);

    pair?.toJson;

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

      return this.getAccounts().find(({ address }) => isSameString(address, keyringAddress))?.meta.name;
    } catch {
      return undefined;
    }
  }

  // в общем и целом можно использоваь getPair вместо getAccount
  getAccount(address: string) {
    return keyring.getAccount(address);
  }

  getAddress(address: string, type: KeyringItemType | null = null) {
    return keyring.getAddress(address, type);
  }

  forgetAccount(address: string) {
    return keyring.forgetAccount(address);
  }

  forgetAddress(address: string) {
    return keyring.forgetAddress(address);
  }

  restoreAccount(file: KeyringPair$Json, password: string) {
    delete file.meta.genesisHash;

    return keyring.restoreAccount(file, password);
  }

  createFromJson(file: KeyringPair$Json) {
    delete file.meta.genesisHash;

    return keyring.createFromJson(file);
  }

  unlockPair(addressOrPair: string | KeyringPair, password: string) {
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
      substratePair.unlock(password);
      ethereumPair?.unlock(password);

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

  getSubstrateAccounts() {
    const accounts = this.getAccounts().filter((el) => !isEthereumAddress(el.address));
    const addresses = this.getAddresses();

    return [...accounts, ...addresses];
  }

  getSubstrateAddress(address: string) {
    if (!isEthereumAddress(address)) return address;

    const accounts = this.getSubstrateAccounts();
    const addresses = this.getAddresses();

    const account =
      accounts.find(
        ({ meta: { ethereumAddress } }) => (ethereumAddress as string)?.toLowerCase() === address.toLowerCase()
      ) ||
      addresses.find(
        ({ meta: { ethereumAddress } }) => (ethereumAddress as string)?.toLowerCase() === address.toLowerCase()
      );

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

  exportMnemonic({ address, password }: RequestExportMnemonic): ResponseExportMnemonic {
    const pair = keyring.getPair(address);

    password;
    pair;

    // const seed = pair.exportMnemonic(password);

    return { seed: '' };
  }
}
