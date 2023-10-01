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
import { NetworkName } from '@/interfaces';

type SubscriptionName = 'balance' | 'xorTotalBalance';

type UpdateSub =
  | {
      name: 'balance';
      func: () => void;
    }
  | {
      name: 'xorTotalBalance';
      func: () => void;
    };

const subscriptions: Subscriptions = {};

type SubscriptionMap = {
  balance?: (() => void) | undefined;
  xorTotalBalance: (() => void) | undefined;
};

export class FWSubscription {
  private serviceSubscription: Subscription | undefined;
  private serviceInfo: { networks: { substrate: NetworkName[]; evm: NetworkName[] }; address: string } = {
    address: '',
    networks: { evm: [], substrate: [] },
  };
  private subscriptionMap: SubscriptionMap = {
    balance: undefined,
    xorTotalBalance: undefined,
  };

  private logger: Logger;

  constructor(private state: State) {
    this.logger = createLogger('Subscription');
    this.init();
  }

  getSubscription(name: SubscriptionName): (() => void) | undefined {
    if (name === 'balance') return this.subscriptionMap[name];

    if (name === 'xorTotalBalance') return this.subscriptionMap[name];

    return undefined;
  }

  updateSubscription(payload: UpdateSub) {
    const { name, func } = payload;

    const oldSub = this.subscriptionMap[name];

    oldSub?.();

    this.subscriptionMap[name] = func;
  }

  stopAllSubscription() {
    this.subscriptionMap.balance?.();
    this.subscriptionMap.balance = undefined;

    this.subscriptionMap.xorTotalBalance?.();
    this.subscriptionMap.xorTotalBalance = undefined;
  }

  async start() {
    this.logger.log('Starting subscription');

    const currentAccount = await this.state.currentAccount;
    const accountsExceptCurrent = this.state
      .getSubstrateAccounts()
      .filter((el) => el.address !== currentAccount?.address);

    accountsExceptCurrent.forEach((account) => {
      const ethAddress = (account.meta.ethereumAddress as string) ?? '';

      this.subscribeBalances(account.address, ethAddress, null, true);
    });

    if (!this.serviceSubscription)
      this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

          if (!serviceInfo.currentAccountInfo) return;

          const { address, ethereumAddress } = serviceInfo.currentAccountInfo;

          const allNewSubstrateNetworks = Object.keys(serviceInfo?.apiMap.substrate ?? {});
          const newSubstrateNetworksWithoutSubscribe = allNewSubstrateNetworks.filter(
            (network) => !this.serviceInfo?.networks.substrate.includes(network)
          );

          const allNewEvmNetworks = Object.keys(serviceInfo?.apiMap.evm ?? {});
          const newEvmNetworksWithoutSubscribe = allNewEvmNetworks.filter(
            (network) => !this.serviceInfo?.networks.evm.includes(network)
          );

          const addressHasChanged = this.serviceInfo.address !== address;

          // если изменился адрес или появились новые сети на которые мы сейчас не подписаны, то подписываемся
          if (
            addressHasChanged ||
            newSubstrateNetworksWithoutSubscribe.length !== 0 ||
            newEvmNetworksWithoutSubscribe.length !== 0
          ) {
            if (addressHasChanged) {
              this.serviceInfo.address = address;

              // если адрес изменился, то подписываемся на все сети
              this.subscribeBalances(address, ethereumAddress, null);
              this.state.fetchEvmBalance(null);
            } else {
              // если адрес не менялся, подписываемся только на новые сети(которые только что включили)
              if (newSubstrateNetworksWithoutSubscribe.length)
                this.subscribeBalances(address, ethereumAddress, newSubstrateNetworksWithoutSubscribe);

              if (newEvmNetworksWithoutSubscribe.length) this.state.fetchEvmBalance(newEvmNetworksWithoutSubscribe);
            }
          }

          // обновляем список сетей на балансы которых мы подписаны
          this.serviceInfo.networks.substrate = allNewSubstrateNetworks;
          this.serviceInfo.networks.evm = allNewEvmNetworks;

          // кейс, когда было [sora, polkadot, kusama]
          // стало [sora], обрабатывать и отписываться от подписок на балансы не нужно,
          // тк мы полностью отклюачемся от api, следовательно подписки умирают сами
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

  subscribeBalances(address: string, ethereumAddress: string, newNetworks: NetworkName[] | null, isFirstRun?: boolean) {
    this.logger.warn(`Start balance sub for: ${address}`);

    try {
      if (isFirstRun) this.state.generateDefaultBalance(address);

      const unsub = subscribeBalance(address, ethereumAddress, newNetworks);

      if (isFirstRun) unsub();
      else
        this.updateSubscription({
          name: 'balance',
          func: unsub,
        });
    } catch {
      this.logger.warn(`Unable to subscribe: ${address}`);
    }
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
