import { logger as createLogger } from '@polkadot/util';
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
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';

type UpdateSub = {
  name: NetworkName;
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
    ton: NetworkName[];
  };
}

export interface GetBalancesProps {
  address: string;
  ethereumAddress: string;
  walletEcosystem?: WalletEcosystem;
  substrateNetworks?: NetworkName[];
  evmNetworks?: NetworkName[];
  tonNetworks?: NetworkName[];
  isFirstRun?: boolean;
}

export class SubscriptionService {
  private logger: Logger;
  private subscriptionsPorts: Subscriptions = {}; // subscriptions for interaction with client side
  private serviceInfoSubscription: Subscription | undefined;
  subscriptionNetworksMap: SubscriptionMap = {}; // subscriptions for networks balances
  private unsubscriptionMap: Record<string, () => void> = {};

  private serviceInfo: ServiceInfo = {
    address: '',
    ethereumAddress: '',
    networks: { evm: [], substrate: [], ton: [] },
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

  updateNetworkSubscription(params: UpdateSub) {
    const { name, func } = params;

    const oldSub = this.subscriptionNetworksMap[name];

    oldSub?.();

    this.subscriptionNetworksMap[name] = func;
  }

  cancelNetworkSubscription(networkName: string) {
    const unsub = this.subscriptionNetworksMap[networkName];

    unsub?.();

    delete this.subscriptionNetworksMap[networkName];
  }

  async start() {
    this.logger.log('Starting subscription');

    const accountsExceptCurrent = this.state.keyringService
      .getAllMainAccounts()
      .filter(({ address }) => !isSameString(address, this.state.currentAccount?.address));

    accountsExceptCurrent.forEach(({ address, meta }) =>
      this.fetchNetworkBalances({
        address,
        ethereumAddress: meta.ethereumAddress ?? '',
        walletEcosystem: meta.walletEcosystem!,
        substrateNetworks: this.state.networkService.activeNetworkByEcosystem.substrateList,
        evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
        tonNetworks: this.state.networkService.activeNetworkByEcosystem.tonList,
        isFirstRun: true,
      })
    );

    if (!this.serviceInfoSubscription)
      this.serviceInfoSubscription = this.state.serviceInfoSubject.subscribe({
        next: (serviceInfo) => {
          console.info('serviceInfo', serviceInfo);

          this.state.timeoutService.lazyNext(
            'updateServiceInfo',
            () => {
              this.state.cronService.updateCron(serviceInfo);
              this.state.nftService.publishNfts();

              if (!serviceInfo.currentAccountInfo) return;

              const { address, ethereumAddress } = serviceInfo.currentAccountInfo;
              const {
                address: oldAddress,
                ethereumAddress: oldEthereumAddress,
                networks: oldNetworks,
              } = this.serviceInfo;

              const isNewAddress = oldAddress !== address;
              const isNewEthereumAddress = !oldEthereumAddress && ethereumAddress !== '';

              const currentSubstrateNetworks = Object.keys(serviceInfo.apiMap.substrate);
              const currentEvmNetworks = Object.keys(serviceInfo.apiMap.evm);
              const currentTonNetworks = Object.keys(serviceInfo.apiMap.ton);

              this.serviceInfo = {
                address,
                ethereumAddress,
                networks: {
                  substrate: currentSubstrateNetworks,
                  evm: currentEvmNetworks,
                  ton: currentTonNetworks,
                },
              };

              // TODO возможно нужно перенести данные отписки в функцию которая отключает API сети
              this.serviceInfo?.networks.substrate.forEach((name) => {
                // если сетей нет в списке сетей на балансы которых мы должны быть подписанными, то удаляем подписку
                if (!currentSubstrateNetworks.includes(name)) this.cancelNetworkSubscription(name);
              });

              if (isNewAddress) {
                this.fetchNetworkBalances({
                  ...serviceInfo.currentAccountInfo,
                  substrateNetworks: this.state.networkService.activeNetworkByEcosystem.substrateList,
                  evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
                  tonNetworks: this.state.networkService.activeNetworkByEcosystem.tonList,
                });

                return;
              }

              if (isNewEthereumAddress) {
                this.fetchNetworkBalances({
                  ...serviceInfo.currentAccountInfo,
                  evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
                });

                return;
              }

              const newSubstrateNetworks = currentSubstrateNetworks.filter(
                (network) => !oldNetworks.substrate.includes(network)
              );
              const newEvmNetworks = currentEvmNetworks.filter((network) => !oldNetworks.evm.includes(network));
              const newTonNetworks = currentTonNetworks.filter((network) => !oldNetworks.ton.includes(network));

              // если адрес не менялся, подписываемся только на новые сети(которые только что включили)
              this.fetchNetworkBalances({
                ...serviceInfo.currentAccountInfo,
                evmNetworks: newEvmNetworks,
                substrateNetworks: newSubstrateNetworks,
                tonNetworks: newTonNetworks,
              });

              // кейс, когда было [sora, polkadot, kusama]
              // стало [sora], обрабатывать и отписываться от подписок на балансы не нужно,
              // тк мы полностью отклюачемся от api, следовательно подписки умирают сами
            },
            1000
          );
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

  async fetchNetworkBalances(props: GetBalancesProps) {
    const { address, walletEcosystem, isFirstRun } = props;

    if (isFirstRun) {
      this.state.balanceService.generateDefaultBalance(address, walletEcosystem!);

      this.state.balanceService.fetchBalance(props);

      return;
    }

    this.state.balanceService.fetchBalance({
      ...props,
      substrateNetworks: [], // Удаялем сабстрейт сети потому что подписываемся на балансы через WS
    });

    if (walletEcosystem === WalletEcosystem.Substrate) this.subscribeSubstrateBalances(props);
  }

  async subscribeSubstrateBalances(props: GetBalancesProps) {
    const unsubList = this.state.balanceService.substrateBalanceService.subscribeSubstrateBalances(props, this.state);

    unsubList.forEach(async (item) => {
      const value = await item;

      this.updateNetworkSubscription({
        name: value.networkName,
        func: value.unsub,
      });
    });
  }
}
