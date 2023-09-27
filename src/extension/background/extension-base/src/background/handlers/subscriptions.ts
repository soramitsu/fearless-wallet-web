// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { logger as createLogger } from '@polkadot/util';
import { Subscription } from 'rxjs';
import { subscribeBalance } from '@extension-base/api/substrate/balance';
import { subscribeEvmBalance } from '@extension-base/api/evm/balance';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import type State from '@extension-base/background/handlers/State';
import type { Logger } from '@polkadot/util/types';
import type {
  MessageTypesWithSubscriptions,
  Port,
  SubscriptionMessageTypes,
  Subscriptions,
} from '@extension-base/background/types/types';

type SubscriptionName = 'balance' | 'xorTotalBalance';
type UpdateSub =
  | {
      name: 'balance';
      func: () => void;
      address: string;
    }
  | {
      name: 'xorTotalBalance';
      func: () => void;
    };
const subscriptions: Subscriptions = {};
type SubscriptionMap = {
  balance: Record<string, () => void>;
  xorTotalBalance: (() => void) | undefined;
};
export class FWSubscription {
  private serviceSubscription: Subscription | undefined;
  private state: State;
  private subscriptionMap: SubscriptionMap = {
    balance: {},
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

  getSubscription(name: SubscriptionName, address?: string): (() => void) | undefined {
    if (name === 'balance' && address) return this.subscriptionMap[name][address];

    if (name === 'xorTotalBalance') return this.subscriptionMap[name];

    return undefined;
  }

  updateSubscription(payload: UpdateSub) {
    if (payload.name === 'balance') {
      const { name, address, func } = payload;
      const oldSub = this.subscriptionMap[name][address];

      if (oldSub) oldSub();

      this.subscriptionMap[name][address] = func;

      return;
    }

    const { name, func } = payload;
    const oldSub = this.subscriptionMap[name];

    if (oldSub) oldSub();

    if (func) this.subscriptionMap[name] = func;
  }

  stopAllSubscription() {
    if (this.subscriptionMap.balance) {
      Object.keys(this.subscriptionMap.balance).forEach((address) => {
        const unsub = this.subscriptionMap.balance[address];
        unsub();
      });

      if (this.subscriptionMap.xorTotalBalance) {
        this.subscriptionMap.xorTotalBalance();
        this.subscriptionMap.xorTotalBalance = undefined;
      }

      this.subscriptionMap.balance = {};
    }
  }

  async start() {
    this.logger.log('Starting subscription');
    const currentAccount = await this.state.currentAccount;
    const getAccountsExeptCurrent = this.state
      .getSubstrateAccounts()
      .filter((el) => el.address !== currentAccount?.address);

    getAccountsExeptCurrent.forEach((account) => {
      const ethAddress = (account.meta.ethereumAddress as string) ?? '';

      this.subscribeBalances(account.address, ethAddress, true);
    });

    !this.serviceSubscription &&
      (this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

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
          previousAuth[url].isAllowedMap = previousAuth[url].isAllowed
            ? this.state.getAddressList(true)
            : this.state.getAddressList();
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

        if (unsub) this.updateSubscription({ name: 'balance', func: unsub, address });
      })
      .catch((err) => console.warn('Unable to subscribe', err));
  }

  initBalanceSubscription(address: string, ethereumAddress: string, onlyRunOnFirstTime?: boolean) {
    this.state.generateDefaultBalance(address);

    const setBalance = (networkKey: string, rs: Partial<BalanceItem>) => {
      const isAccountExists = this.state.keyringService.getAccounts().some((el) => el.address === address);

      if (!isAccountExists) return;

      this.state.setBalanceItem(networkKey, rs, address);
    };

    const unsub = subscribeBalance(address, ethereumAddress, setBalance);

    const unsubEvm = ethereumAddress ? subscribeEvmBalance(address, ethereumAddress, setBalance) : () => {};

    if (onlyRunOnFirstTime) {
      unsub && unsub();
      unsubEvm && unsubEvm();

      return;
    }

    return () => {
      unsub && unsub();
      unsubEvm && unsubEvm();
    };
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
        console.info('Error occurred while trying to post message', error);

        unsubscribe(id);
      }
    }
  };
}

export function isSubscriptionRunning(id: string): boolean {
  return !!subscriptions[id];
}
