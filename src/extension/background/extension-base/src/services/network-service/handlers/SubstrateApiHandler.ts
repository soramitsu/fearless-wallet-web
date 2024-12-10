import { ApiPromise } from '@polkadot/api';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { WsProvider } from '@polkadot/rpc-provider';
import { SoraApiHandler } from './SoraApiHandler';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import { isSora } from '@/helpers';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

export class SubstrateApiHandler {
  api: Record<NetworkName, ApiProps> = {};

  constructor(readonly networkService: NetworkService, public state: State) {}

  refreshDotSamaApi(key: string) {
    if (this.api[key]) {
      this.api[key].nodeIndex = 0;
      this.api[key].apiRetry = 0;
    }

    const network = this.networkService.getNetworkJson(key);

    this.initApi(network);
  }

  createApiObject(): ApiProps {
    return {
      isEthereum: false,
      apiStatus: NETWORK_STATUS.CONNECTING,
      apiRetry: 0,
      nodeIndex: 0,
    };
  }

  resetApiRetries() {
    Object.values(this.api).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }

  getListeners(network: NetworkJson) {
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

    return {
      currentProvider,
      eventListeners,
    };
  }

  async initApi(network: NetworkJson): Promise<void> {
    const networkName = network.name.toLowerCase();

    const { currentProvider, eventListeners } = this.getListeners(network);

    if (isSora(networkName)) return SoraApiHandler.initApi(currentProvider, eventListeners);

    try {
      const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);

      this.api[networkName].api = new ApiPromise({ provider, noInitWarn: true });
      this.api[networkName].provider = provider;

      eventListeners.forEach(([eventName, callback]) => this.api[networkName].api?.on(eventName, callback));
    } catch {
      this.onDisconnect(networkName);
    }
  }

  onConnected(networkName: NetworkName) {
    if (isSora(networkName)) this.api[networkName].api = SoraApiHandler.getApiInstance();

    this.api[networkName].apiRetry = 0;
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTED;
  }

  async onReady(networkName: NetworkName) {
    if (isSora(networkName)) SoraApiHandler.initialize(this.state);

    const account = this.state.currentAccount;

    if (!account) return;

    this.state.subscriptionService.getNetworkSubscription(networkName)?.();
    this.state.subscriptionService.subscribeBalances(account.address, account.ethereumAddress, [networkName], []);
    this.state.balanceService.updateUtilityED(networkName);
  }

  async onDisconnect(networkName: NetworkName) {
    const api = this.api[networkName.toLowerCase()];
    const netName = this.networkService.getNetworkJson(networkName).name;
    const network = this.networkService.networkMap[netName];

    if (api === undefined) {
      this.state.subscriptionService.getNetworkSubscription(networkName)?.(); //clean up;

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
      api.apiStatus = NETWORK_STATUS.DISCONNECTED; // попробовали все ноды, не смогли подключиться, ставим статус дисконнект

      this.state.disableNetworkMap(networkName);
    }
  }
}
