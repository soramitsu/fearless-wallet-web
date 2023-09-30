import { logger as createLogger } from '@polkadot/util';
import { Subscription } from 'rxjs';
import { subscribeBalance } from '@extension-base/api/substrate/balance';
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
  private addressSubscribed: string | undefined;
  private subscriptionMap: SubscriptionMap = {
    balance: {},
    xorTotalBalance: undefined,
  };

  private logger: Logger;

  constructor(private state: State) {
    this.logger = createLogger('Subscription');
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

      console.log('oldSub', oldSub);

      oldSub?.();

      this.subscriptionMap[name][address] = func;

      return;
    }

    const { name, func } = payload;
    const oldSub = this.subscriptionMap[name];

    oldSub?.();

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
    const accountsExceptCurrent = this.state
      .getSubstrateAccounts()
      .filter((el) => el.address !== currentAccount?.address);

    accountsExceptCurrent.forEach((account) => {
      const ethAddress = (account.meta.ethereumAddress as string) ?? '';

      this.subscribeBalances(account.address, ethAddress, true);
    });

    if (!this.serviceSubscription)
      this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

          if (!serviceInfo.currentAccountInfo) return;

          const { address, ethereumAddress } = serviceInfo.currentAccountInfo;

          if (this.addressSubscribed !== address) {
            this.addressSubscribed = address;

            this.subscribeBalances(address, ethereumAddress);
          }
        },
      });
  }

  stop() {
    this.logger.log('Stop subscription');

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

  subscribeBalances(address: string, ethereumAddress: string, isFirstRun?: boolean) {
    this.logger.warn(`Start balance sub for: ${address}`);

    try {
      const unsub = this.initBalanceSubscription(address, ethereumAddress, isFirstRun);

      if (isFirstRun) unsub();
      else
        this.updateSubscription({
          name: 'balance',
          func: unsub,
          address,
        });
    } catch {
      this.logger.warn(`Unable to subscribe: ${address}`);
    }
  }

  initBalanceSubscription(address: string, ethereumAddress: string, isFirstRun?: boolean) {
    if (isFirstRun) this.state.generateDefaultBalance(address);

    return subscribeBalance(address, ethereumAddress);
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
