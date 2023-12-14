import { ApiPromise, WsProvider } from '@polkadot/api';
import { api as apiSora } from '@sora-substrate/util';
import { connection as soraConnection } from '@sora-substrate/connection';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type State from '@extension-base/background/handlers/State';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import { isSora } from '@/helpers';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';

function createApiObject(): ApiProps {
  return {
    isEthereum: false,
    apiStatus: NETWORK_STATUS.CONNECTING,
    apiRetry: 0,
    nodeIndex: 0,
  };
}

function onConnected(networkName: string, state: State) {
  if (isSora(networkName)) state.apis.substrate[networkName].api = soraConnection.api!;

  state.apis.substrate[networkName].apiRetry = 0;
  state.apis.substrate[networkName].apiStatus = NETWORK_STATUS.CONNECTED;
}

async function onDisconnect(networkName: string, state: State) {
  const api = state.getSubstrateApiMap[networkName.toLowerCase()];
  const netName = state.getNetworkByKey(networkName).name;
  const network = state.networkMap[netName];

  if (!network.active) return;

  if (api === undefined) return;

  api.apiRetry += 1;

  if (api.apiRetry < MAX_CONTINUE_RETRY) return;

  api.api?.disconnect();
  api.provider?.disconnect();

  api.nodeIndex += 1;

  if (api.nodeIndex <= network.nodes.length - 1) {
    api.apiRetry = 0;
    api.provider = undefined;
    api.api = undefined;

    if (navigator.onLine) initApi(network, state);
    else api.apiStatus = NETWORK_STATUS.DISCONNECTED;
  } else {
    api.apiStatus = NETWORK_STATUS.DISCONNECTED; // попробовали все ноды, не смогил подключиться, ставим статус дисконнект

    state.disableNetworkMap(networkName);
  }
}

function onReady(networkName: string, state: State) {
  if (isSora(networkName)) {
    apiSora.initialize(false);
    apiSora.calcStaticNetworkFees();

    state.subscribeTotalXorBalance();
  }
}

export async function initApi(network: NetworkJson, state: State): Promise<void> {
  const { name, nodes } = network;
  const networkName = name.toLowerCase();

  if (state.getSubstrateApiMap[networkName] === undefined) state.getSubstrateApiMap[networkName] = createApiObject();

  const { nodeIndex } = state.getSubstrateApiMap[networkName];

  const autoSelectNode = network.isManual ? null : nodes[nodeIndex].url;
  const currentProvider = autoSelectNode ?? network.currentProvider;
  const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
    ['connected', () => onConnected(networkName, state)],
    ['disconnected', () => onDisconnect(name, state)],
    ['ready', () => onReady(networkName, state)],
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
