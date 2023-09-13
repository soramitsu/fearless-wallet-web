import { ApiPromise, WsProvider } from '@polkadot/api';
import { api as apiSora } from '@sora-substrate/util';
import { connection as soraConnection } from '@sora-substrate/connection';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { state } from '@extension-base/background/handlers';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import { isSora } from '@/helpers';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';

function createApiObject(): ApiProps {
  return {
    isApiConnected: false,
    isApiReady: false,
    isEthereum: false,
    isEthereumOnly: false,
    apiRetry: 0,
    nodeIndex: 0,
  } as unknown as ApiProps;
}

export function createEvmApiObject(): ApiProps {
  return {
    api: undefined,
    provider: undefined,
    nodeIndex: 0,
    isApiConnected: true,
    isApiReady: false,
    isEthereum: true,
    isEthereumOnly: true,
    apiRetry: 0,
    get isReady() {
      return Promise.resolve(this);
    },
  } as unknown as ApiProps;
}

function onConnected(networkName: string) {
  if (isSora(networkName)) {
    state.apis.substrate[networkName].api = soraConnection.api!;
  }

  state.apis.substrate[networkName].apiRetry = 0;
  state.apis.substrate[networkName].isApiConnected = true;
  state.apis.substrate[networkName].isApiReady = false;
}

async function onDisconnect(networkName: string) {
  const api = state.getSubstrateApiMap[networkName];

  if (!state.networkMap[networkName].active) return;

  if (api === undefined) return;

  api.apiRetry += 1;
  api.isApiConnected = false;
  api.isApiReady = false;

  if (api.apiRetry < MAX_CONTINUE_RETRY) return;

  const network = state.networkMap[networkName];

  api.provider?.disconnect();
  api.nodeIndex += 1;

  if (api.nodeIndex <= network.nodes.length - 1) {
    api.apiRetry = 0;
    api.provider = undefined;
    api.api = undefined;

    if (navigator.onLine) initApi(network);

    return;
  }

  state.disableNetworkMap(networkName);
}

function onReady(networkName: string) {
  if (isSora(networkName)) {
    apiSora.initialize(false);
    apiSora.calcStaticNetworkFees();

    state.subscribeTotalXorBalance();
  }

  state.apis.substrate[networkName].isApiReady = true;
}

export async function initApi(network: NetworkJson, retry = false): Promise<void> {
  const { name: networkName, nodes } = network;

  if (state.getSubstrateApiMap[networkName] === undefined) {
    // return EVM HTTP Placeholder
    state.getSubstrateApiMap[networkName] = createApiObject();
  }

  if (retry) {
    state.apis.substrate[networkName].nodeIndex = 0;
    state.apis.substrate[networkName].apiRetry = 0;
  }

  const { nodeIndex } = state.getSubstrateApiMap[networkName];

  const autoSelectNode = network.isManual ? null : nodes[nodeIndex].url;
  const currentProvider = autoSelectNode ?? network.currentProvider;
  const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
    ['connected', () => onConnected(networkName)],
    ['disconnected', () => onDisconnect(networkName)],
    ['ready', () => onReady(networkName)],
    ['error', () => null],
  ];

  if (isSora(networkName)) soraConnection.open(currentProvider, { autoConnectMs: AUTO_CONNECT_MS, eventListeners });
  else {
    try {
      const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);

      const api = new ApiPromise({ provider, noInitWarn: true });

      eventListeners.forEach(([eventName, callback]) => api.on(eventName, callback));

      state.apis.substrate[networkName].api = api;
      state.apis.substrate[networkName].provider = provider;
    } catch {
      console.warn(`Error while init api for ${networkName}`);
    }
  }
}
