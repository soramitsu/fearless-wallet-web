import { KeypairType } from '@polkadot/util-crypto/types';
import { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import { KeyringAddressType, KeyringItemType, KeyringStore } from '@polkadot/ui-keyring/types';
import { keyring } from '@polkadot/ui-keyring';

// import { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
// import { BehaviorSubject } from 'rxjs';
// import { isEthereumAddress } from '@polkadot/util-crypto';
// import CurrentAccountStore, { CurrentAccountState } from '../../stores/CurrentAccountStore';
// import { EventService } from '../event-service';
// import { KeyringState } from '../../types';

export class KeyringService {
  // private readonly currentAccountStore = new CurrentAccountStore();
  // readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);

  // public readonly addressesSubject = keyring.addresses.subject;
  // public readonly accountSubject = keyring.accounts.subject;

  // readonly keyringStateSubject = new BehaviorSubject<KeyringState>({
  //   isReady: false,
  // });

  // constructor(private eventService: EventService) {
  //   this.currentAccountStore.get('CurrentAccountInfo', (rs) => {
  //     rs && this.currentAccountSubject.next(rs);
  //   });
  // }

  // get keyringState() {
  //   return this.keyringStateSubject.value;
  // }

  // updateKeyringState(isReady = true) {
  //   if (!this.keyringState.isReady && isReady) {
  //     this.eventService.emit('keyring.ready', true);
  //   }

  //   this.keyringStateSubject.next({
  //     isReady,
  //   });
  // }

  // get accounts(): SubjectInfo {
  //   return this.accountSubject.value;
  // }

  // get addresses(): SubjectInfo {
  //   return this.addressesSubject.value;
  // }

  // get currentAddress() {
  //   if (this.currentAccount) return this.currentAccount.address;

  //   return '';
  // }

  // get currentAccount(): CurrentAccountState {
  //   return this.currentAccountSubject.value;
  // }

  // public getSubstrateAccounts() {
  //   const accounts = keyring.getAccounts().filter((el) => !isEthereumAddress(el.address));
  //   const addresses = keyring.getAddresses();

  //   return [...accounts, ...addresses];
  // }

  // setCurrentAccount(currentAccountData: CurrentAccountState) {
  //   this.currentAccountSubject.next(currentAccountData);
  //   this.eventService.emit('account.updateCurrent', currentAccountData);
  //   this.currentAccountStore.set('CurrentAccountInfo', currentAccountData);

  //   this.updateKeyringState(true);
  // }

  // resetWallet() {
  //   this.updateKeyringState();
  //   this.currentAccountSubject.next(null);
  // }

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

  unlockPair(addressOrPair: string | KeyringPair | null, password: string) {
    const pair = typeof addressOrPair === 'string' ? this.getPair(addressOrPair) : addressOrPair;

    if (!pair) return false;

    try {
      pair.unlock(password);

      const { meta } = pair;
      const ethereumAddress = meta?.ethereumAddress as string | undefined;

      if (ethereumAddress) {
        const ethereumPair = this.getPair(ethereumAddress)!;

        ethereumPair.unlock(password);
      }

      return true;
    } catch (e: any) {
      pair.lock();

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

export const keyringService = new KeyringService();
