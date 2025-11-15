import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getApiPromiseCtor, getWsProviderCtor } from '@extension-base/services/utils/polkadot';
import { SoraApiHandler } from './SoraApiHandler';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { type NetworkName } from '@/interfaces';
import { isSora } from '@/helpers';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

export class SubstrateApiHandler {
  api: Record<NetworkName, ApiProps> = {};

  constructor(
    readonly networkService: NetworkService,
    public state: State
  ) {}

  async destroyApi(network: string) {
    const networkLower = network.toLowerCase();

    if (!this.api[networkLower]) return;

    this.api[networkLower].apiRetry = 0;

    await this.api[networkLower]?.api?.disconnect();
    await this.api[networkLower]?.provider?.disconnect();

    delete this.api[networkLower]?.api;
    delete this.api[networkLower]?.provider;
  }

  refreshDotSamaApi(key: string) {
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

  getListeners(network: NetworkJson) {
    const { name, nodes } = network;
    const networkName = name.toLowerCase();

    if (this.api[networkName] === undefined) this.api[networkName] = this.createApiObject();
    const { nodeIndex } = this.api[networkName];

    let currentProvider = network.isManual ? network.currentProvider : (nodes[nodeIndex].url ?? nodes[0].url);

    if (currentProvider.includes('dwellir')) {
      currentProvider = `${currentProvider}/${process.env.FL_DWELLIR_API_KEY}`;
    }

    const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
      ['connected', () => this.onConnected(networkName)],
      ['disconnected', () => this.onDisconnected(name)],
      ['ready', () => this.onReady(networkName)],
      ['error', () => null],
    ];

    return {
      currentProvider,
      eventListeners,
    };
  }

  async initApi(network: NetworkJson) {
    const networkName = network.name.toLowerCase();

    const { currentProvider, eventListeners } = this.getListeners(network);

    if (isSora(networkName)) return SoraApiHandler.initApi(currentProvider, eventListeners);

    const WsProvider = await getWsProviderCtor();
    const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);
    const ApiPromise = await getApiPromiseCtor();

    this.api[networkName].api = new ApiPromise({ provider, noInitWarn: true });
    this.api[networkName].provider = provider;

    eventListeners.forEach(([eventName, callback]) => this.api[networkName].api?.on(eventName, callback));
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

    this.state.subscriptionService.subscribeSubstrateBalances({
      address: account.address,
      ethereumAddress: account.ethereumAddress,
      substrateNetworks: [networkName],
    });

    this.state.balanceService.updateUtilityED(networkName);
  }

  async onDisconnected(networkName: NetworkName) {
    const api = this.api[networkName.toLowerCase()];
    const netName = this.networkService.getNetworkJson(networkName).name;
    const network = this.networkService.networkMap[netName];

    if (api === undefined) {
      this.state.subscriptionService.cancelNetworkSubscription(networkName);

      return;
    }

    api.apiRetry += 1;

    if (api.apiRetry < MAX_CONTINUE_RETRY) return;

    await this.destroyApi(networkName);

    api.nodeIndex += 1;

    const isOnline = 'onLine' in navigator ? navigator.onLine : true;

    if (api.nodeIndex <= network.nodes.length - 1 && isOnline) {
      this.initApi(network);
    } else {
      api.apiStatus = NETWORK_STATUS.DISCONNECTED; // попробовали все ноды, не смогли подключиться, ставим статус дисконнект

      this.state.disableNetworkMap(networkName);
    }
  }
}
