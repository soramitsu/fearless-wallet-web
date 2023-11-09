import { KeypairType } from '@polkadot/util-crypto/types';
import { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import { KeyringAddressType, KeyringItemType, KeyringStore } from '@polkadot/ui-keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { isEthereumAddress } from '@polkadot/util-crypto';
import State from '@extension-base/background/handlers/State';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@polkadot/ui-keyring/observable/addresses';
import { getSubstrateAddress, isEthereumNetwork } from '../../background/utils/utils';
import { isSameString } from '@/helpers';
type Wallet = {
  address: string;
  ethereumAddress: string;
};

export class KeyringService {
  constructor(readonly state: State) {}

  get addressesSubjectValue() {
    return keyring.addresses.subject.value;
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

  getAccounts() {
    return keyring.getAccounts();
  }

  getAddresses() {
    return keyring.getAddresses();
  }

  get addressSubject() {
    return addressesObservable.subject;
  }

  get accountSubject() {
    return accountsObservable.subject;
  }

  triggerWalletsSubscription(): boolean {
    const accountsSubject = accountsObservable.subject;
    const addressSubject = addressesObservable.subject;

    accountsSubject.next(accountsSubject.getValue());
    addressSubject.next(addressSubject.getValue());

    return true;
  }

  addAccount(suri: string, password: string, meta: KeyringPair$Meta, type?: KeypairType) {
    const {
      pair: { address },
    } = keyring.addUri(suri, password, { ...meta, isMobile: false }, type);

    return address;
  }

  saveAddress(address: string, meta: KeyringPair$Meta, type: KeyringAddressType) {
    keyring.saveAddress(address, meta, type);
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

  unlockPair(addressOrPair: string | KeyringPair, password: string) {
    const pair = this.getPair(addressOrPair);

    if (!pair) return false;

    const { address } = pair;
    const isEthereum = isEthereumAddress(address);
    const substrateAddress = getSubstrateAddress(address, this.state);

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

  saveAccountMeta(address: string, meta: KeyringPair$Meta) {
    const pair = this.getPair(address);

    if (!pair) return;

    keyring.saveAccountMeta(pair, { ...pair.meta, ...meta });
  }

  createFromUri(suri: string, keypairType: KeypairType, meta: KeyringPair$Meta = {}) {
    keyring.createFromUri(suri, meta, keypairType);
  }

  formatAddress({ address, ethereumAddress }: Wallet, networkName: string): string {
    const isEthereumNet = isEthereumNetwork(networkName);

    if (isEthereumNet) return ethereumAddress;

    const network = this.state.networksJson.find(({ name }) => isSameString(name, networkName));
    const prefix = network?.addressPrefix;

    // the only case for try/catch
    // if the user used ethereum account instead of a substratum account(via json or private key)
    try {
      return this.encodeAddress(address, prefix);
    } catch {
      return ethereumAddress;
    }
  }
}
