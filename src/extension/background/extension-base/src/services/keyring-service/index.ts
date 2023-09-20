import { KeypairType } from '@polkadot/util-crypto/types';
import { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import { KeyringAddressType, KeyringItemType, KeyringStore } from '@polkadot/ui-keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { getSubstrateAddress } from '../../background/utils/utils';

export class KeyringService {
  get addressesSubjectValue() {
    return keyring.addresses.subject.value;
  }

  loadAll(store: KeyringStore, type: KeypairType = 'sr25519') {
    return keyring.loadAll({
      store,
      type,
    });
  }

  getAccounts() {
    return keyring.getAccounts();
  }

  getAddresses() {
    return keyring.getAddresses();
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

  getPair(address: string) {
    try {
      return keyring.getPair(address);
    } catch {
      return null;
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
    return keyring.restoreAccount(file, password);
  }

  unlockPair(addressOrPair: string | KeyringPair, password: string) {
    const pair = typeof addressOrPair === 'string' ? this.getPair(addressOrPair) : addressOrPair;

    if (!pair) return false;

    const { address } = pair;
    const isEthereum = isEthereumAddress(address);
    const substrateAddress = getSubstrateAddress(address);
    const substratePair = isEthereum ? this.getPair(substrateAddress) : pair;
    const ethereumAddress = isEthereum ? address : (substratePair?.meta.ethereumAddress as string | undefined);

    if (!substratePair) return false;

    try {
      substratePair.unlock(password);

      if (ethereumAddress) {
        const ethereumPair = this.getPair(ethereumAddress);

        ethereumPair?.unlock(password);
      }

      return true;
    } catch (e: any) {
      substratePair.lock();

      if (ethereumAddress) {
        const ethereumPair = this.getPair(ethereumAddress);

        ethereumPair?.lock();
      }

      return false;
    }
  }

  lockPair(addressOrPair: string | KeyringPair | undefined) {
    const pair = typeof addressOrPair === 'string' ? this.getPair(addressOrPair) : addressOrPair;

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
}
