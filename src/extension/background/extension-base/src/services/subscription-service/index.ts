import { logger as createLogger } from '@polkadot/util';
import { type Subscription } from 'rxjs';
import { subscribeBalance } from '@extension-base/api/substrate/balance';
import type State from '@extension-base/background/handlers/State';
import type { Logger } from '@polkadot/util/types';
import type {
  MessageTypesWithSubscriptions,
  Port,
  SubscriptionMessageTypes,
  Subscriptions,
} from '@extension-base/background/types/types';
import { type NetworkName } from '@/interfaces';
import { SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';

type SubscriptionName = 'xorTotalBalance' | NetworkName;

type UpdateSub = {
  name: SubscriptionName;
  func: () => void;
};

type SubscriptionMap = {
  [key in string]: (() => void) | undefined;
};

export class SubscriptionService {
  static subscriptions: Subscriptions = {};
  private serviceSubscription: Subscription | undefined;
  public readonly unsubscriptionMap: Record<string, () => void> = {};
  private serviceInfo: {
    networks: { substrate: NetworkName[]; evm: NetworkName[] };
    address: string;
    ethereumAddress: string;
  } = {
    address: '',
    ethereumAddress: '',
    networks: { evm: [], substrate: [] },
  };
  private subscriptionMap: SubscriptionMap = {};
  private logger: Logger;

  constructor(private state: State) {
    this.logger = createLogger('Subscription');
    this.init();
  }

  getSubscription(name: SubscriptionName): (() => void) | undefined {
    return this.subscriptionMap[name];
  }

  updateSubscription(payload: UpdateSub) {
    const { name, func } = payload;

    const oldSub = this.getSubscription(name);

    oldSub?.();

    this.subscriptionMap[name] = func;
  }

  stopAllSubscription(names?: string[]) {
    if (names?.length === 0) return;

    Object.entries(this.subscriptionMap)
      .filter(([name]) => names?.includes(name) ?? true)
      .forEach(([name, unsub]) => {
        unsub?.();

        this.subscriptionMap[name] = undefined;
      });

    if (names === undefined) this.subscriptionMap = {};
  }

  async start() {
    this.logger.log('Starting subscription');

    const accountsExceptCurrent = this.state.keyringService
      .getSubstrateAccounts()
      .filter((el) => el.address !== this.state.currentAccount?.address);

    accountsExceptCurrent.forEach((account) => {
      const ethAddress = (account.meta.ethereumAddress as string) ?? '';

      this.subscribeBalances(account.address, ethAddress, null, null, true);
    });

    if (!this.serviceSubscription)
      this.serviceSubscription = this.state.subscribeServiceInfo().subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

          this.state.cronService.updateCron(serviceInfo);

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
          const thereIsEthereumAddress = this.serviceInfo.ethereumAddress === '' && ethereumAddress !== '';

          // если изменился адрес или появились новые сети на которые мы сейчас не подписаны, то подписываемся
          if (
            addressHasChanged ||
            thereIsEthereumAddress ||
            newSubstrateNetworksWithoutSubscribe.length !== 0 ||
            newEvmNetworksWithoutSubscribe.length !== 0
          ) {
            if (addressHasChanged) {
              this.state.balanceService.publishBalance();

              // если адрес изменился, то подписываемся на все сети
              this.subscribeBalances(address, ethereumAddress, null, null);
            } else if (thereIsEthereumAddress) {
              this.subscribeBalances(address, ethereumAddress, SUBSTRATE_ETHEREUM_NETWORKS, null);
            } else {
              // если адрес не менялся, подписываемся только на новые сети(которые только что включили)
              this.subscribeBalances(
                address,
                ethereumAddress,
                newSubstrateNetworksWithoutSubscribe,
                newEvmNetworksWithoutSubscribe
              );
            }

            this.state.nftService.publishNfts();
            this.serviceInfo.address = address;
            this.serviceInfo.ethereumAddress = ethereumAddress;
          }

          // если сетей нет в списке сетей на балансы которых нужно быть подписанными
          // то удаляем ее подписку
          // P.S этого можно не делать, тк api сети уже disconnect, но все же удалим подписку
          const networkUnsub = this.serviceInfo?.networks.substrate.filter(
            (name) => !allNewSubstrateNetworks.includes(name)
          );

          this.stopAllSubscription(networkUnsub);

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
    this.state.requestService.getAuthorize((authUrls) => {
      const previousAuth = authUrls;

      if (previousAuth && Object.keys(previousAuth).length) {
        Object.keys(previousAuth).forEach((url) => {
          previousAuth[url].allowedAccountsMap = previousAuth[url].isAllowed
            ? this.state.getAddressList(true)
            : this.state.getAddressList();
        });
      }

      const migrateValue = { ...previousAuth, ...authUrls };

      this.state.requestService.setAuthorize(migrateValue);
    });
  }

  async subscribeBalances(
    address: string,
    ethereumAddress: string,
    newNetworks: NetworkName[] | null,
    newEvmNetworks: NetworkName[] | null,
    isFirstRun?: boolean
  ) {
    if (isFirstRun) this.state.balanceService.generateDefaultBalance(address);

    if (newEvmNetworks?.length) this.state.fetchEvmBalance({ _networks: newEvmNetworks, ethereumAddress });

    const unsubList = subscribeBalance(address, ethereumAddress, newNetworks, this.state);

    if (isFirstRun) {
      // ждем 20 секунд, потом отписываемся, за это время ответят большинство сетей
      // можно было бы дожидаться и await`ить все подписки разом, но некоторые сети очень долго отвечают
      setTimeout(() => {
        unsubList.forEach(async (subPromise) => {
          const sub = await subPromise;

          sub.unsub();
        });
      }, 20000);

      return;
    }

    unsubList.forEach(async (item) => {
      const value = await item;

      this.updateSubscription({
        name: value.networkName,
        func: value.unsub,
      });
    });
  }
}

// clear a previous subscriber
export function unsubscribe(id: string): void {
  if (SubscriptionService.subscriptions[id]) {
    delete SubscriptionService.subscriptions[id];
  } else console.error(`Unable to unsubscribe from ${id}`);
}

export function createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  port?: Port
): (data: SubscriptionMessageTypes[TMessageType] | null) => void {
  SubscriptionService.subscriptions[id] = 'sw-messages';

  return (subscription: unknown): void => {
    if (SubscriptionService.subscriptions[id]) {
      try {
        // port.postMessage({ id, subscription });
        const channel = new BroadcastChannel('sw-messages');
        channel.postMessage({ id, subscription });
      } catch (error) {
        console.info('Error occurred while trying to post message', error);

        unsubscribe(id);
      }
    }
  };
}

export function isSubscriptionRunning(id: string): boolean {
  return !!SubscriptionService.subscriptions[id];
}
