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
import { type NetworkName } from '@/interfaces';
import { isSora } from '@/helpers';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

export class SubstrateApiHandler {
  api: Record<NetworkName, ApiProps> = {};
  private readonly connectionRevision: Record<NetworkName, number> = {};

  constructor(readonly networkService: NetworkService, public state: State) {}

  async destroyApi(network: string) {
    const networkLower = network.toLowerCase();

    const entry = this.api[networkLower];
    if (!entry) return false;
    const { api, provider } = entry;
    const revision = this.connectionRevision[networkLower];

    entry.apiRetry = 0;

    await api?.disconnect();
    await provider?.disconnect();

    if (this.connectionRevision[networkLower] !== revision || this.api[networkLower] !== entry) return false;
    delete entry.api;
    delete entry.provider;
    return true;
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
    const revision = this.connectionRevision[networkName];
    const ownsConnection = () => this.connectionRevision[networkName] === revision;

    if (this.api[networkName] === undefined) this.api[networkName] = this.createApiObject();
    const { nodeIndex } = this.api[networkName];

    let currentProvider = network.isManual ? network.currentProvider : nodes[nodeIndex]?.url ?? nodes[0].url;

    if (currentProvider.includes('dwellir')) {
      currentProvider = `${currentProvider}/${process.env.FL_WEB_DWELLIR_API_KEY || process.env.FL_DWELLIR_API_KEY || ''}`;
    }

    const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
      ['connected', () => { if (ownsConnection()) this.onConnected(networkName); }],
      ['disconnected', () => { if (ownsConnection()) void this.onDisconnected(name).catch(console.warn); }],
      ['ready', () => { if (ownsConnection()) void this.onReady(networkName).catch(console.warn); }],
      ['error', () => null],
    ];

    return {
      currentProvider,
      eventListeners,
    };
  }

  async initApi(network: NetworkJson) {
    const networkName = network.name.toLowerCase();
    this.connectionRevision[networkName] = (this.connectionRevision[networkName] ?? 0) + 1;

    const { currentProvider, eventListeners } = this.getListeners(network);
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTING;
    this.api[networkName].apiRetry = 0;

    if (isSora(networkName)) return SoraApiHandler.initApi(currentProvider, eventListeners);

    const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);

    const api = new ApiPromise({ provider, noInitWarn: true });
    this.api[networkName].api = api;
    this.api[networkName].provider = provider;
    // ApiPromise rejects this even when no balance/signing caller is awaiting readiness yet.
    void api.isReadyOrError.catch((error) => {
      if (this.api[networkName]?.api !== api) return;
      this.api[networkName].apiStatus = NETWORK_STATUS.DISCONNECTED;
      console.warn('Substrate connection unavailable', networkName, error);
    });

    eventListeners.forEach(([eventName, callback]) => this.api[networkName].api?.on(eventName, callback));
  }

  onConnected(networkName: NetworkName) {
    if (isSora(networkName)) this.api[networkName].api = SoraApiHandler.getApiInstance();

    this.api[networkName].apiRetry = 0;
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTED;
  }

  async onReady(networkName: NetworkName) {
    const revision = this.connectionRevision[networkName];
    const api = this.api[networkName]?.api;
    const ownsConnection = () => this.connectionRevision[networkName] === revision && this.api[networkName]?.api === api;
    if (isSora(networkName)) await SoraApiHandler.initialize(this.state, ownsConnection);
    if (!ownsConnection()) return;

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

    if (!await this.destroyApi(networkName)) return;

    api.nodeIndex += 1;

    if (api.nodeIndex <= network.nodes.length - 1 && navigator.onLine) {
      this.initApi(network);
    } else {
      api.apiStatus = NETWORK_STATUS.DISCONNECTED; // попробовали все ноды, не смогли подключиться, ставим статус дисконнект

      this.state.disableNetworkMap(networkName);
    }
  }
}
