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
import { IS_EXTENSION_SMOKE } from '@/consts/global';

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
    solana: NetworkName[];
    bitcoin: NetworkName[];
    iroha: NetworkName[];
  };
}

export interface GetBalancesProps {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  walletEcosystem?: WalletEcosystem;
  substrateNetworks?: NetworkName[];
  evmNetworks?: NetworkName[];
  tonNetworks?: NetworkName[];
  solanaNetworks?: NetworkName[];
  bitcoinNetworks?: NetworkName[];
  irohaNetworks?: NetworkName[];
  isFirstRun?: boolean;
}

export class SubscriptionService {
  private logger: Logger;
  private subscriptionsPorts: Subscriptions = {}; // subscriptions for interaction with client side
  private serviceInfoSubscription: Subscription | undefined;
  subscriptionNetworksMap: SubscriptionMap = {}; // subscriptions for networks balances
  private unsubscriptionMap: Record<string, () => void> = {};
  private subscriptionTokens = new Map<string, symbol>();
  private networkSubscriptionTokens = new Map<string, symbol>();

  private serviceInfo: ServiceInfo = {
    address: '',
    ethereumAddress: '',
    networks: { evm: [], substrate: [], ton: [], solana: [], bitcoin: [], iroha: [] },
  };

  constructor(private state: State) {
    this.logger = createLogger('Subscription');

    void this.init().catch(() => this.logger.error('Unable to persist authorization account display state'));
  }

  // Clear a previous subscriber
  private unsubscribe(id: string): void {
    delete this.subscriptionsPorts[id];
    this.subscriptionTokens.delete(id);
  }

  createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
    id: string,
    port?: Port
  ): (data: SubscriptionMessageTypes[TMessageType] | null) => void {
    if (this.subscriptionsPorts[id]) this.cancelSubscription(id);
    const token = Symbol(id);
    this.subscriptionTokens.set(id, token);
    this.subscriptionsPorts[id] = port ?? 'sw-messages';

    // 'subscription' is a callback
    return (subscription: unknown): void => {
      if (this.subscriptionTokens.get(id) === token) {
        try {
          if (port) port.postMessage({ id, subscription });
          else {
            const channel = new BroadcastChannel('sw-messages');
            try { channel.postMessage({ id, subscription }); }
            finally { channel.close(); }
          }
        } catch (error) {
          console.info('Error occurred while trying to post message', error);

          this.cancelSubscription(id);
        }
      }
    };
  }

  setUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    // BehaviorSubject may deliver (and close the port) before subscribe() returns its handle.
    if (!this.subscriptionsPorts[id]) {
      unsubscribe();
      return;
    }
    this.unsubscriptionMap[id] = unsubscribe;
  }

  cancelSubscription(id: string): boolean {
    // Clear subscribe port
    this.unsubscribe(id);

    const cleanup = this.unsubscriptionMap[id];
    delete this.unsubscriptionMap[id];
    cleanup?.();

    return true;
  }

  updateNetworkSubscription(params: UpdateSub) {
    const { name, func } = params;
    const key = name.toLowerCase();
    const oldSub = this.subscriptionNetworksMap[key];
    this.subscriptionNetworksMap[key] = func;
    oldSub?.();
  }

  cancelNetworkSubscription(networkName: string) {
    const key = networkName.toLowerCase();
    const unsub = this.subscriptionNetworksMap[key];
    this.networkSubscriptionTokens.delete(key);
    delete this.subscriptionNetworksMap[key];
    unsub?.();
  }

  async start() {
    this.logger.log('Starting subscription');

    const accountsExceptCurrent = this.state.keyringService
      .getAllMainAccounts()
      .filter(({ address }) => !isSameString(address, this.state.currentAccount?.address));

    accountsExceptCurrent.forEach(({ address, meta }) =>
      this.fetchNetworkBalances({
        address,
        bitcoinAddress: meta.bitcoinAddress as string | undefined,
        bitcoinTestnetAddress: meta.bitcoinTestnetAddress as string | undefined,
        ethereumAddress: meta.ethereumAddress ?? '',
        irohaAddress: meta.irohaAddress as string | undefined,
        solanaAddress: meta.solanaAddress as string | undefined,
        walletEcosystem: meta.walletEcosystem!,
        substrateNetworks: this.state.networkService.activeNetworkByEcosystem.substrateList,
        evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
        tonNetworks: this.state.networkService.activeNetworkByEcosystem.tonList,
        solanaNetworks: this.state.networkService.activeNetworkByEcosystem.solanaList,
        bitcoinNetworks: this.state.networkService.activeNetworkByEcosystem.bitcoinList,
        irohaNetworks: this.state.networkService.activeNetworkByEcosystem.irohaList,
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

              if (!serviceInfo.currentAccountInfo) {
                new Set([...this.networkSubscriptionTokens.keys(), ...Object.keys(this.subscriptionNetworksMap)])
                  .forEach((name) => this.cancelNetworkSubscription(name));
                this.serviceInfo.address = '';
                this.serviceInfo.ethereumAddress = '';
                return;
              }

              const { address, ethereumAddress } = serviceInfo.currentAccountInfo;
              const {
                address: oldAddress,
                ethereumAddress: oldEthereumAddress,
                networks: oldNetworks,
              } = this.serviceInfo;

              const isNewAddress = oldAddress !== address;
              const isNewEthereumAddress = oldEthereumAddress !== ethereumAddress;

              const currentSubstrateNetworks = Object.keys(serviceInfo.apiMap.substrate);
              const currentEvmNetworks = Object.keys(serviceInfo.apiMap.evm);
              const currentTonNetworks = Object.keys(serviceInfo.apiMap.ton);
              const currentSolanaNetworks = this.state.networkService.activeNetworkByEcosystem.solanaList;
              const currentBitcoinNetworks = this.state.networkService.activeNetworkByEcosystem.bitcoinList;
              const currentIrohaNetworks = this.state.networkService.activeNetworkByEcosystem.irohaList;

              this.serviceInfo = {
                address,
                ethereumAddress,
                networks: {
                  substrate: currentSubstrateNetworks,
                  evm: currentEvmNetworks,
                  ton: currentTonNetworks,
                  solana: currentSolanaNetworks,
                  bitcoin: currentBitcoinNetworks,
                  iroha: currentIrohaNetworks,
                },
              };

              // Compare with the previous network set before discarding removed subscriptions.
              new Set([...oldNetworks.substrate, ...this.networkSubscriptionTokens.keys(), ...Object.keys(this.subscriptionNetworksMap)]).forEach((name) => {
                if (isNewAddress || isNewEthereumAddress || !currentSubstrateNetworks.some((current) => isSameString(current, name)))
                  this.cancelNetworkSubscription(name);
              });

              if (isNewAddress || isNewEthereumAddress) {
                this.fetchNetworkBalances({
                  ...serviceInfo.currentAccountInfo,
                  substrateNetworks: this.state.networkService.activeNetworkByEcosystem.substrateList,
                  evmNetworks: this.state.networkService.activeNetworkByEcosystem.evmList,
                  tonNetworks: this.state.networkService.activeNetworkByEcosystem.tonList,
                  solanaNetworks: this.state.networkService.activeNetworkByEcosystem.solanaList,
                  bitcoinNetworks: this.state.networkService.activeNetworkByEcosystem.bitcoinList,
                  irohaNetworks: this.state.networkService.activeNetworkByEcosystem.irohaList,
                });

                return;
              }

              const newSubstrateNetworks = currentSubstrateNetworks.filter(
                (network) => !oldNetworks.substrate.includes(network)
              );
              const newEvmNetworks = currentEvmNetworks.filter((network) => !oldNetworks.evm.includes(network));
              const newTonNetworks = currentTonNetworks.filter((network) => !oldNetworks.ton.includes(network));
              const newSolanaNetworks = currentSolanaNetworks.filter((network) => !oldNetworks.solana.includes(network));
              const newBitcoinNetworks = currentBitcoinNetworks.filter(
                (network) => !oldNetworks.bitcoin.includes(network)
              );
              const newIrohaNetworks = currentIrohaNetworks.filter((network) => !oldNetworks.iroha.includes(network));

              // если адрес не менялся, подписываемся только на новые сети(которые только что включили)
              this.fetchNetworkBalances({
                ...serviceInfo.currentAccountInfo,
                evmNetworks: newEvmNetworks,
                substrateNetworks: newSubstrateNetworks,
                tonNetworks: newTonNetworks,
                solanaNetworks: newSolanaNetworks,
                bitcoinNetworks: newBitcoinNetworks,
                irohaNetworks: newIrohaNetworks,
              });

            },
            1000
          );
        },
      });
  }

  async init(): Promise<void> {
    await this.state.requestService.mutateAuthorizations((authUrls) => {
      for (const auth of Object.values(authUrls)) {
        auth.allowedAccountsMap = auth.isAllowed ? this.state.getAddressList(true) : this.state.getAddressList();
      }
    });
  }

  async fetchNetworkBalances(props: GetBalancesProps) {
    if (IS_EXTENSION_SMOKE) return;

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
    const matchesAccount = () => this.state.currentAccount?.address === props.address &&
      (this.state.currentAccount?.ethereumAddress ?? '') === props.ethereumAddress;
    if (!matchesAccount()) return;
    const tokens = new Map<string, symbol>();
    for (const network of props.substrateNetworks ?? []) {
      const key = network.toLowerCase();
      this.cancelNetworkSubscription(key);
      const token = Symbol(key);
      tokens.set(key, token);
      this.networkSubscriptionTokens.set(key, token);
    }
    const isCurrent = (network: string) => {
      const key = network.toLowerCase();
      return tokens.has(key) && tokens.get(key) === this.networkSubscriptionTokens.get(key) &&
        matchesAccount();
    };
    const unsubList = this.state.balanceService.substrateBalanceService.subscribeSubstrateBalances(props, this.state, isCurrent);
    await Promise.all(unsubList.map(async (item) => {
      try {
        const value = await item;
        if (!isCurrent(value.networkName)) value.unsub();
        else this.updateNetworkSubscription({ name: value.networkName, func: value.unsub });
      } catch {
        this.logger.error('Unable to start balance subscription');
      }
    }));
  }
}
