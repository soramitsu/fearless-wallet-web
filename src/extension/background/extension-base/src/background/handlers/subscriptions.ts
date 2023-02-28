// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { logger as createLogger } from '@polkadot/util';
import { Logger } from '@polkadot/util/types';
import { Subscription } from 'rxjs';
import { ApiProps, MessageTypesWithSubscriptions, Port, SubscriptionMessageTypes } from '../types';
import EthProvider from '../../api/evm/ethProvider';
import { subscribeBalance } from '../../api/substrate/balance';
import State from './State';

type SubscriptionName = 'balance' | 'balanceEVM';
type Subscriptions = Record<string, Port>;

const subscriptions: Subscriptions = {};
export class FWSubscription {
  private serviceSubscription: Subscription | undefined;
  private state: State;
  private subscriptionMap: Record<SubscriptionName, (() => void) | undefined> = {
    balance: undefined,
    balanceEVM: undefined,
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
      // console.log(currentAccountInfo, 'curr account');

      if (currentAccountInfo) {
        const { address } = currentAccountInfo;
        this.subscribeBalances(address, this.state.getSubstrateApiMap, this.state.getEvmApiMap);
      }
    });

    !this.serviceSubscription &&
      (this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          const { address } = serviceInfo.currentAccountInfo;

          this.state.initChainRegistry();
          this.subscribeBalances(address, serviceInfo.apiMap.substrate, serviceInfo.apiMap.evm);
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

    this.state.getCurrentAccount((currentAccountInfo) => {
      if (currentAccountInfo) {
        const { address } = currentAccountInfo;

        this.subscribeBalances(address, this.state.getSubstrateApiMap, this.state.getEvmApiMap, true);
      }
    });
  }

  subscribeBalances(
    address: string,
    dotSamaApiMap: Record<string, ApiProps>,
    web3ApiMap: Record<string, EthProvider>,
    onlyRunOnFirstTime?: boolean
  ) {
    this.logger.log('Start balance sub');
    this.state
      .switchAccount(address)
      .then(() => {
        this.state
          .getDecodedAddresses(address)
          .then((addresses) => {
            if (!addresses.length) return;
            // console.log(dotSamaApiMap, 'api map');
            this.updateSubscription(
              'balance',
              this.initBalanceSubscription(addresses, dotSamaApiMap, web3ApiMap, onlyRunOnFirstTime)
            );
          })
          .catch(this.logger.error);
      })
      .catch((err) => this.logger.warn(err));
  }

  initBalanceSubscription(
    addresses: string[],
    dotSamaApiMap: Record<string, ApiProps>,
    web3ApiMap: Record<string, EthProvider>,
    onlyRunOnFirstTime?: boolean
  ) {
    const unsub = subscribeBalance(addresses, dotSamaApiMap, web3ApiMap, (networkKey, rs) => {
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
  port: Port
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
