import { ApiPromise, WsProvider } from '@polkadot/api';
import { TypeRegistry } from '@polkadot/types/create';
import { api as apiSora, connection as soraConnection } from '@sora-substrate/util';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { state } from '@extension-base/background/handlers';
import { getCurrentProvider } from '@extension-base/utils/utils';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type { NetworkJsonOld } from '@extension-base/types';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import { isSora } from '@/helpers/common';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';

function createApiObject(): ApiProps {
  return {
    apiDefaultTx: undefined,
    apiDefaultTxSudo: undefined,
    apiError: undefined,
    defaultFormatBalance: undefined,
    isApiConnected: false,
    isApiReady: false,
    isApiInitialized: false,
    isEthereum: false,
    isEthereumOnly: false,
    registry: new TypeRegistry(), // TODO это нужно?
    specName: '',
    specVersion: '',
    systemChain: '',
    systemName: '',
    systemVersion: '',
    apiRetry: 0,
    nodeIndex: 0,
  } as unknown as ApiProps;
}

function generateEvmHttpApi(): ApiProps {
  return {
    api: undefined,
    provider: undefined,
    apiDefaultTx: undefined,
    apiDefaultTxSudo: undefined,
    apiError: undefined,
    nodeIndex: 0,
    defaultFormatBalance: undefined,
    isApiConnected: true,
    isApiReady: true,
    isApiInitialized: true,
    isEthereum: true,
    tryAnotherNode: true,
    isEthereumOnly: true,
    registry: new TypeRegistry(), // TODO это нужно?
    specName: '',
    specVersion: '',
    systemChain: '',
    systemName: '',
    systemVersion: '',
    apiRetry: 0,
    recoverConnect: () => {
      // console.info('Reconnect http API', apiUrl);
    },
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
  state.apis.substrate[networkName].isApiReady = false; // todo ??? apiObject.isApiInitialized;
}

function onDisconnect(networkName: string) {
  if (state.apis.substrate[networkName] === undefined) return;

  state.apis.substrate[networkName].apiRetry += 1;
  state.apis.substrate[networkName].isApiConnected = false;
  state.apis.substrate[networkName].isApiReady = false;

  const { apiRetry, nodeIndex } = state.apis.substrate[networkName];

  if (apiRetry <= MAX_CONTINUE_RETRY) {
    state.apis.substrate[networkName].provider?.disconnect();

    if (nodeIndex <= state.networkMap[networkName].nodes.length - 1) {
      state.apis.substrate[networkName].apiRetry = 0;
      state.apis.substrate[networkName].nodeIndex += 1;
      state.apis.substrate[networkName].provider = undefined;
      state.apis.substrate[networkName].api = undefined;
      state.apis.substrate[networkName].apiUrl = '';

      // eslint-disable-next-line no-use-before-define
      if (navigator.onLine) initApi(state.networkMap[networkName]);
    } else {
      state.disableNetworkMap(networkName);
    }
  }
}

function onReady(networkName: string) {
  if (isSora(networkName)) {
    apiSora.initialize(false);
    apiSora.calcStaticNetworkFees();

    state.subscribeTotalXorBalance();
  }

  state.apis.substrate[networkName].isApiReady = true;
}

export async function initApi(network: NetworkJsonOld): Promise<void> {
  const { name: networkName, providers, isEthereum } = network;

  if (state.apis.substrate[networkName] === undefined) {
    if (isEthereum)
      // return EVM HTTP Placeholder
      state.apis.substrate[networkName] = generateEvmHttpApi();
    else state.apis.substrate[networkName] = createApiObject();
  }

  const { nodeIndex } = state.apis.substrate[networkName];
  const autoSelectNode = network.isManual ? getCurrentProvider(network) : null;
  const currentProvider = autoSelectNode ?? Object.values(providers)[nodeIndex];

  const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
    ['connected', () => onConnected(networkName)],
    ['disconnected', () => onDisconnect(networkName)],
    ['ready', () => onReady(networkName)],
    ['error', () => onDisconnect(networkName)],
  ];

  if (isSora(networkName)) soraConnection.open(currentProvider, { autoConnectMs: AUTO_CONNECT_MS, eventListeners });
  else {
    try {
      const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS);

      const api = new ApiPromise({ provider, noInitWarn: true });
      eventListeners.forEach(([eventName, callback]) => api.on(eventName, callback));

      state.apis.substrate[networkName].api = api;
      state.apis.substrate[networkName].provider = provider;
    } catch {
      console.warn(`Error while init api for ${networkName}`);
    }
  }
}
