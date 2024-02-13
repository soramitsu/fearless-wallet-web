import { ApiPromise } from '@polkadot/api';
import { type ApiInterfaceEvents } from '@polkadot/api/types';
import { WsProvider } from '@polkadot/rpc-provider';
import { type ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { type NetworkService } from '@extension-base/services/network-service';
import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { type ApiProps } from '@extension-base/background/types/types';
import { api as apiSora } from '@sora-substrate/util';
import { connection as soraConnection } from '@sora-substrate/connection';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import { isSora } from '@/helpers';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';

export class SubstrateApiHandler {
  readonly networkService: NetworkService;
  state: State;
  api: Record<NetworkName, ApiProps> = {};

  constructor(networkService: NetworkService, state: State) {
    this.networkService = networkService;
    this.state = state;
  }

  async initApi(network: NetworkJson): Promise<void> {
    const { name, nodes } = network;
    const networkName = name.toLowerCase();

    if (this.api[networkName] === undefined) this.api[networkName] = this.createApiObject();
    const { nodeIndex } = this.api[networkName];

    const autoSelectNode = network.isManual ? null : nodes[nodeIndex].url;
    const currentProvider = autoSelectNode ?? network.currentProvider;
    const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
      ['connected', () => this.onConnected(networkName)],
      ['disconnected', () => this.onDisconnect(name)],
      ['ready', () => this.onReady(networkName)],
      ['error', () => null],
    ];

    if (isSora(networkName)) soraConnection.open(currentProvider, { autoConnectMs: AUTO_CONNECT_MS, eventListeners });
    else {
      try {
        const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);

        this.api[networkName].api = new ApiPromise({ provider, noInitWarn: true });
        this.api[networkName].provider = provider;

        eventListeners.forEach(([eventName, callback]) => this.api[networkName].api?.on(eventName, callback));
      } catch {
        this.onDisconnect(networkName);
      }
    }
  }

  createApiObject(): ApiProps {
    return {
      isEthereum: false,
      apiStatus: NETWORK_STATUS.CONNECTING,
      apiRetry: 0,
      nodeIndex: 0,
    };
  }

  onConnected(networkName: string) {
    if (isSora(networkName)) this.api[networkName].api = soraConnection.api!;

    this.api[networkName].apiRetry = 0;
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTED;
  }

  async onDisconnect(networkName: string) {
    const api = this.api[networkName.toLowerCase()];
    const netName = this.networkService.getNetworkByKey(networkName).name;
    const network = this.networkService.networkMap[netName];

    if (api === undefined) {
      this.state.subscription.getSubscription(networkName)?.(); //clean up;

      return;
    }

    api.apiRetry += 1;

    if (api.apiRetry < MAX_CONTINUE_RETRY) return;

    api.provider?.disconnect();

    api.nodeIndex += 1;

    if (api.nodeIndex <= network.nodes.length - 1) {
      api.apiRetry = 0;
      api.provider = undefined;
      api.api = undefined;

      if (navigator.onLine) this.initApi(network);
      else {
        api.apiStatus = NETWORK_STATUS.DISCONNECTED;
        this.state.disableNetworkMap(networkName);
      }
    } else {
      api.apiStatus = NETWORK_STATUS.DISCONNECTED; // попробовали все ноды, не смогил подключиться, ставим статус дисконнект

      this.state.disableNetworkMap(networkName);
    }
  }

  async onReady(networkName: string) {
    if (isSora(networkName)) {
      apiSora.initialize(false);
      apiSora.calcStaticNetworkFees();

      this.state.subscribeTotalXorBalance();
    }

    const account = this.state.currentAccount;

    if (!account) return;

    this.state.subscription.getSubscription(networkName)?.();
    this.state.subscription.subscribeBalances(account.address, account.ethereumAddress, [networkName], []);
  }

  public refreshDotSamaApi(key: string) {
    if (this.api[key]) {
      this.api[key].nodeIndex = 0;
      this.api[key].apiRetry = 0;
    }

    const network = this.networkService.getNetworkByKey(key);

    this.initApi(network);
  }

  resetApiRetries() {
    Object.values(this.api).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }
}
