// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { keyring } from '@polkadot/ui-keyring';
import { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import { BehaviorSubject } from 'rxjs';
import { isEthereumAddress } from '@polkadot/util-crypto';

import CurrentAccountStore, { CurrentAccountState } from '../../stores/CurrentAccountStore';
import { EventService } from '../event-service';
import { KeyringState } from '../../types';

export class KeyringService {
  private readonly currentAccountStore = new CurrentAccountStore();
  readonly currentAccountSubject = new BehaviorSubject<CurrentAccountState>(null);

  readonly addressesSubject = keyring.addresses.subject;
  public readonly accountSubject = keyring.accounts.subject;

  readonly keyringStateSubject = new BehaviorSubject<KeyringState>({
    isReady: false,
  });

  constructor(private eventService: EventService) {
    this.currentAccountStore.get('CurrentAccountInfo', (rs) => {
      rs && this.currentAccountSubject.next(rs);
    });

    this.eventServiceReady();
  }

  async eventServiceReady() {
    await this.eventService.waitAccountReady;
  }

  get keyringState() {
    return this.keyringStateSubject.value;
  }

  updateKeyringState(isReady = true) {
    if (!this.keyringState.isReady && isReady) {
      this.eventService.emit('keyring.ready', true);
      this.eventService.emit('account.ready', true);
    }

    this.keyringStateSubject.next({
      isReady,
    });
  }

  get accounts(): SubjectInfo {
    return this.accountSubject.value;
  }

  get addresses(): SubjectInfo {
    return this.addressesSubject.value;
  }

  get currentAddress() {
    if (this.currentAccount) return this.currentAccount.address;

    return '';
  }
  get currentAccount(): CurrentAccountState {
    return this.currentAccountSubject.value;
  }

  public getSubstrateAccounts() {
    const accounts = keyring.getAccounts().filter((el) => !isEthereumAddress(el.address));
    const addresses = keyring.getAddresses();

    return [...accounts, ...addresses];
  }

  setCurrentAccount(currentAccountData: CurrentAccountState) {
    this.currentAccountSubject.next(currentAccountData);
    this.eventService.emit('account.updateCurrent', currentAccountData);
    this.currentAccountStore.set('CurrentAccountInfo', currentAccountData);

    this.updateKeyringState(true);
  }

  resetWallet() {
    this.updateKeyringState();
    this.currentAccountSubject.next(null);
  }
}
