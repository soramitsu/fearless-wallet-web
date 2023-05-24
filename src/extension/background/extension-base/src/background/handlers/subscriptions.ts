// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { logger as createLogger } from '@polkadot/util';
import { Subscription } from 'rxjs';
import { subscribeBalance } from '../../api/substrate/balance';
import type State from './State';
import type { Logger } from '@polkadot/util/types';
import type { MessageTypesWithSubscriptions, Port, SubscriptionMessageTypes } from '../types/types';

type SubscriptionName = 'balance' | 'xorTotalBalance';
type Subscriptions = Record<string, Port>;

const subscriptions: Subscriptions = {};

export class FWSubscription {
  private serviceSubscription: Subscription | undefined;
  private state: State;
  private subscriptionMap: Record<SubscriptionName, (() => void) | undefined> = {
    balance: undefined,
    xorTotalBalance: undefined,
  };

  private logger: Logger;

  constructor(state: State) {
    this.logger = createLogger('Subscription');
    this.state = state;
    this.init();
  }

  getSubscriptionMap() {
    return this.subscriptionMap;
  }

  getSubscription(name: SubscriptionName): (() => void) | undefined {
    return this.subscriptionMap[name];
  }

  updateSubscription(name: SubscriptionName, func: (() => void) | undefined) {
    const oldFunc = this.subscriptionMap[name];

    if (oldFunc) oldFunc();

    if (func) this.subscriptionMap[name] = func;
  }

  stopAllSubscription() {
    if (this.subscriptionMap.balance) {
      this.subscriptionMap.balance();

      delete this.subscriptionMap.balance;
    }
  }

  async start() {
    this.logger.log('Starting subscription');
    const currentAccount = await this.state.currentAccount;
    const getAccountsExeptCurrent = this.state
      .getSubstrateAccounts()
      .filter((el) => el.address !== currentAccount?.address);

    getAccountsExeptCurrent.forEach((account) => {
      const ethAddress = account.meta.ethereumAddress as string;

      this.subscribeBalances(account.address, ethAddress, true);
    });

    !this.serviceSubscription &&
      (this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          console.info(serviceInfo, 'serviceInfo');
          if (!serviceInfo.currentAccountInfo) return;

          const { address, ethereumAddress } = serviceInfo.currentAccountInfo;

          this.subscribeBalances(address, ethereumAddress);
        },
      }));
  }

  stop() {
    this.logger.log('Stopping subscription');

    if (this.serviceSubscription) {
      this.serviceSubscription.unsubscribe();
      this.serviceSubscription = undefined;
    }

    this.stopAllSubscription();
  }

  init() {
    this.state.getAuthorize((value) => {
      const authUrls = this.state.authUrls;
      const previousAuth = authUrls;

      if (previousAuth && Object.keys(previousAuth).length) {
        Object.keys(previousAuth).forEach((url) => {
          if (previousAuth[url].isAllowed) {
            previousAuth[url].isAllowedMap = this.state.getAddressList(true);
          } else {
            previousAuth[url].isAllowedMap = this.state.getAddressList();
          }
        });
      }

      const migrateValue = { ...previousAuth, ...value };

      this.state.setAuthorize(migrateValue);
    });
  }

  subscribeBalances(address: string, ethereumAddress: string, onlyRunOnFirstTime?: boolean) {
    this.logger.log('Start balance sub for:', address);

    this.state
      .resetBalanceMap()
      .then(() => {
        const unsub = this.initBalanceSubscription(address, ethereumAddress, onlyRunOnFirstTime);

        this.updateSubscription('balance', unsub);
      })
      .catch((err) => console.warn('Unable to subscribe', err));
  }

  initBalanceSubscription(address: string, ethereumAddress: string, onlyRunOnFirstTime?: boolean) {
    const unsub = subscribeBalance(address, ethereumAddress, (networkKey, rs) => {
      this.state.setBalanceItem(networkKey, rs, address);
    });

    if (onlyRunOnFirstTime) {
      unsub && unsub();

      return;
    }

    return () => unsub && unsub();
  }
}

// clear a previous subscriber
export function unsubscribe(id: string): void {
  if (subscriptions[id]) {
    console.info(`Unsubscribing from ${id}`);

    delete subscriptions[id];
  } else {
    console.error(`Unable to unsubscribe from ${id}`);
  }
}

export function createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
  id: string,
  port: Port
): (data: SubscriptionMessageTypes[TMessageType] | null) => void {
  subscriptions[id] = port;

  return (subscription: unknown): void => {
    if (subscriptions[id]) {
      try {
        port.postMessage({ id, subscription });
      } catch (error) {
        console.info('Error occured while trying to post message', error);

        unsubscribe(id);
      }
    }
  };
}

export function isSubscriptionRunning(id: string): boolean {
  return !!subscriptions[id];
}
