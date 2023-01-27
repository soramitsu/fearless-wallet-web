// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { Subscription } from 'rxjs';
import { MessageTypesWithSubscriptions, SubscriptionMessageTypes } from '../types';
import EthProvider from '../../api/evm/ethProvider';
import { storage } from '../../stores/Storage';
import { subscribeBalance } from '../../api/substrate/balance';
import State from './State';

type SubscriptionName = 'balance';
type Subscriptions = Record<string, chrome.runtime.Port>;

const subscriptions: Subscriptions = {};
export class FWSubscription {
  private serviceSubscription: Subscription | undefined;
  private state: State;
  private subscriptionMap: Record<SubscriptionName, (() => void) | undefined> = {
    balance: undefined,
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

    oldFunc && oldFunc();
    func && (this.subscriptionMap[name] = func);
  }

  stopAllSubscription() {
    if (this.subscriptionMap.balance) {
      this.subscriptionMap.balance();
      delete this.subscriptionMap.balance;
    }
  }

  start() {
    this.logger.log('Starting subscription');
    this.state.getCurrentAccount((currentAccountInfo) => {
      if (currentAccountInfo) {
        const { address } = currentAccountInfo;

        this.subscribeBalances(address, this.state.apis.evm);
      }
    });

    !this.serviceSubscription &&
      (this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          const { address } = serviceInfo.currentAccountInfo;

          this.state.initChainRegistry();
          this.subscribeBalances(address, serviceInfo.apiMap.evm);
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
    this.state.getAuthorize(async (value) => {
      const { authUrls } = await storage.get(['authUrls']);
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

      // const migrateValue = { ...previousAuth, ...value };

      // State.setAuthorize(migrateValue);
    });

    this.state.getCurrentAccount((currentAccountInfo) => {
      if (currentAccountInfo) {
        const { address } = currentAccountInfo;

        this.subscribeBalances(address, this.state.apis.evm, true);

        // this.stopAllSubscription();
      }
    });
  }

  subscribeBalances(address: string, web3ApiMap: Record<string, EthProvider>, onlyRunOnFirstTime?: boolean) {
    this.state
      .switchAccount(address)
      .then(() => {
        this.state
          .getDecodedAddresses(address)
          .then((addresses) => {
            if (!addresses.length) return;

            this.updateSubscription(
              'balance',
              this.initBalanceSubscription(address, addresses, web3ApiMap, onlyRunOnFirstTime)
            );
          })
          .catch(this.logger.error);
      })
      .catch((err) => this.logger.warn(err));
  }

  initBalanceSubscription(
    key: string,
    addresses: string[],
    web3ApiMap: Record<string, EthProvider>,
    onlyRunOnFirstTime?: boolean
  ) {
    const unsub = subscribeBalance(addresses, web3ApiMap, (networkKey, rs) => {
      this.state.setBalanceItem(networkKey, rs);
    });

    if (onlyRunOnFirstTime) {
      unsub && unsub();

      return;
    }

    return () => {
      unsub && unsub();
    };
  }
}

export function createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
  id: string,
  port: chrome.runtime.Port
): (data: SubscriptionMessageTypes[TMessageType]) => void {
  subscriptions[id] = port;

  return (subscription: unknown): void => {
    if (subscriptions[id]) {
      port.postMessage({ id, subscription });
    }
  };
}

export function isSubscriptionRunning(id: string): boolean {
  return !!subscriptions[id];
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
