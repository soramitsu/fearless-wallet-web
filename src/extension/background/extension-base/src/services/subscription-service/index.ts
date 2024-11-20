import { logger as createLogger } from '@polkadot/util';
import { subscribeBalance } from '@extension-base/api/substrate/balance';
import type { Subscription } from 'rxjs';
import type State from '@extension-base/background/handlers/State';
import type { Logger } from '@polkadot/util/types';
import type {
  MessageTypesWithSubscriptions,
  Port,
  SubscriptionMessageTypes,
  Subscriptions,
} from '@extension-base/background/types/types';
import type { NetworkName } from '@/interfaces';
import { SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';

type SubscriptionName = 'xorTotalBalance' | NetworkName;

type UpdateSub = {
  name: SubscriptionName;
  func: () => void;
};

type SubscriptionMap = {
  [key in string]: (() => void) | undefined;
};

interface ServiceInfo {
  address: string;
  ethereumAddress: string;
  networks: {
    substrate: NetworkName[];
    evm: NetworkName[];
  };
}

export class SubscriptionService {
  private logger: Logger;
  private subscriptionsPorts: Subscriptions = {}; // subscriptions for interaction with client side
  private serviceInfoSubscription: Subscription | undefined;
  private subscriptionNetworksMap: SubscriptionMap = {}; // subscriptions for networks balances
  private unsubscriptionMap: Record<string, () => void> = {};

  private serviceInfo: ServiceInfo = {
    address: '',
    ethereumAddress: '',
    networks: { evm: [], substrate: [] },
  };

  constructor(private state: State) {
    this.logger = createLogger('Subscription');

    this.init();
  }

  // Clear a previous subscriber
  private unsubscribe(id: string): void {
    if (this.subscriptionsPorts[id]) delete this.subscriptionsPorts[id];
    else console.error(`Unable to unsubscribe from ${id}`);
  }

  createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
    id: string,
    port?: Port
  ): (data: SubscriptionMessageTypes[TMessageType] | null) => void {
    this.subscriptionsPorts[id] = port ?? 'sw-messages';

    // 'subscription' is a callback
    return (subscription: unknown): void => {
      if (this.subscriptionsPorts[id]) {
        try {
          port?.postMessage({ id, subscription });
        } catch (error) {
          console.info('Error occurred while trying to post message', error);

          this.unsubscribe(id);
        }
      }
    };
  }

  setUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    this.unsubscriptionMap[id] = unsubscribe;
  }

  cancelSubscription(id: string): boolean {
    // Clear subscribe port
    this.unsubscribe(id);

    if (this.unsubscriptionMap[id]) {
      this.unsubscriptionMap[id]();

      delete this.unsubscriptionMap[id];
    }

    return true;
  }

  getNetworkSubscription(name: SubscriptionName): (() => void) | undefined {
    return this.subscriptionNetworksMap[name];
  }

  updateNetworkSubscription(params: UpdateSub) {
    const { name, func } = params;

    const oldSub = this.getNetworkSubscription(name);

    oldSub?.();

    this.subscriptionNetworksMap[name] = func;
  }

  stopAllNetworksSubscription(names?: string[]) {
    if (names?.length === 0) return;

    Object.entries(this.subscriptionNetworksMap)
      .filter(([name]) => names?.includes(name) ?? true)
      .forEach(([name, unsub]) => {
        unsub?.();

        this.subscriptionNetworksMap[name] = undefined;
      });

    if (names === undefined) this.subscriptionNetworksMap = {};
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

    if (!this.serviceInfoSubscription)
      this.serviceInfoSubscription = this.state.subscribeServiceInfo().subscribe({
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

          this.stopAllNetworksSubscription(networkUnsub);

          // обновляем список сетей на балансы которых мы подписаны
          this.serviceInfo.networks.substrate = allNewSubstrateNetworks;
          this.serviceInfo.networks.evm = allNewEvmNetworks;

          // кейс, когда было [sora, polkadot, kusama]
          // стало [sora], обрабатывать и отписываться от подписок на балансы не нужно,
          // тк мы полностью отклюачемся от api, следовательно подписки умирают сами
        },
      });
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

    if (isFirstRun)
      return newNetworks?.forEach((network) => {
        this.state.balanceService.fetchBalance(address, network, ethereumAddress);
      });

    const unsubList = subscribeBalance(address, ethereumAddress, newNetworks, this.state);

    unsubList.forEach(async (item) => {
      const value = await item;

      this.updateNetworkSubscription({
        name: value.networkName,
        func: value.unsub,
      });
    });
  }
}
