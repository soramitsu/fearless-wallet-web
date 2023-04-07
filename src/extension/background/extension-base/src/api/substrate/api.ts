// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { ApiPromise, WsProvider } from '@polkadot/api';
import { TypeRegistry } from '@polkadot/types/create';
import { Registry } from '@polkadot/types/types';
import { api as apiSora, connection as soraConnection } from '@sora-substrate/util';
import { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import { ApiProps } from '../../background/types/types';
import { DOTSAMA_AUTO_CONNECT_MS } from '../../const/intervals';
import { state } from '../../background/handlers';
import { NetworkJsonOld } from '../../types';
import { getCurrentProvider } from '../../utils';
import { isSora } from '@/helpers/common';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';
export const DEFAULT_AUX = ['Aux1', 'Aux2', 'Aux3', 'Aux4', 'Aux5', 'Aux6', 'Aux7', 'Aux8', 'Aux9'];

function createApiObject(apiUrl: string, isEthereum: boolean, registry: TypeRegistry) {
  const result: ApiProps = {
    apiDefaultTx: undefined,
    apiDefaultTxSudo: undefined,
    apiError: undefined,
    apiUrl,
    defaultFormatBalance: undefined,
    isApiConnected: false,
    isApiReady: false,
    isApiInitialized: false,
    isEthereum,
    isEthereumOnly: false,
    registry,
    specName: '',
    specVersion: '',
    systemChain: '',
    systemName: '',
    systemVersion: '',
    apiRetry: 0,
  } as unknown as ApiProps;

  return result;
}

function generateEvmHttpApi(apiUrl: string, registry: Registry): ApiProps {
  return {
    api: undefined,
    provider: undefined,
    apiDefaultTx: undefined,
    apiDefaultTxSudo: undefined,
    apiError: undefined,
    apiUrl,
    nodeIndex: 0,
    defaultFormatBalance: undefined,
    isApiConnected: true,
    isApiReady: true,
    isApiInitialized: true,
    isEthereum: true,
    tryAnotherNode: true,
    isEthereumOnly: true,
    registry,
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

function onDisconnect(apiObject: ApiProps, network: string) {
  apiObject.apiRetry += 1;
  apiObject.isApiConnected = false;
  apiObject.provider = undefined;
  apiObject.isApiReady = false; // result.isApiInitialized && result.isApiConnected

  // console.info(`DotSamaAPI disconnected from ${JSON.stringify(apiUrl)} ${JSON.stringify(result.apiRetry)} times`);
  if (apiObject.apiRetry >= MAX_CONTINUE_RETRY) {
    if (state.networkMap[network].nodes.length <= apiObject.nodeIndex + 1) {
      apiObject.apiRetry = 0;
      apiObject.nodeIndex += 1;
      apiObject.provider = undefined;
      const networkObj = state.networkMap[network];
      if (navigator.onLine) initApi(networkObj);
    } else {
      apiObject.tryAnotherNode = false;
      // console.info(`Discontinue to use ${JSON.stringify(apiUrl)} because max retry`);
      apiObject.api.disconnect().then(console.info).catch(console.error);

      state.disableNetworkMap(network);
    }
  }
}

function onConnected(apiObject: ApiProps, network: string) {
  const api = isSora(network) ? soraConnection.api! : apiObject.api!;
  apiObject.api = api;
  apiObject.apiRetry = 0;
  apiObject.isApiConnected = true;
  apiObject.isApiReady = apiObject.isApiInitialized;
}

function onReady(apiObject: Partial<ApiProps>, network: string) {
  if (isSora(network)) apiSora.initialize(false);

  apiObject.isApiReady = true;
}

export async function initApi(network: NetworkJsonOld): Promise<void> {
  const registry = new TypeRegistry();

  const { name: networkName, providers, isEthereum } = network;

  const autoSelectNode = network.isManual ? getCurrentProvider(network) : null;

  const currentProvider = autoSelectNode ?? Object.values(providers)[0];

  const apiObject: ApiProps = createApiObject(currentProvider, !!isEthereum, registry);
  const eventListeners: Array<['connected' | 'disconnected' | 'ready', ProviderInterfaceEmitCb]> = [
    ['connected', () => onConnected(apiObject, networkName)],
    [
      'ready',
      () => {
        const api = soraConnection.api;
        if (api) return onReady(apiObject, networkName);
      },
    ],
  ];

  if (isEthereum) {
    // return EVM HTTP Placeholder
    state.apis.substrate[networkName] = generateEvmHttpApi(currentProvider, registry);
  }

  if (isSora(networkName)) {
    eventListeners.push(['disconnected', () => onDisconnect(apiObject, networkName)]);

    await soraConnection.open(currentProvider, {
      autoConnectMs: AUTO_CONNECT_MS,
      eventListeners,
    });
  } else {
    const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS);

    // Init ApiPromise with selected provider
    const api = new ApiPromise({ provider, noInitWarn: true });

    apiObject.api = api;
    apiObject.provider = provider;
    // Create APIProps Object

    // Listen ApiPromise events
    // On connected: provider is connected
    api
      .on('connected', () => {
        onConnected(apiObject, networkName);
      })
      // On disconnected: provider is disconnected
      .on('disconnected', () => {
        onDisconnect(apiObject, networkName);
      })
      // On ready: Load all metadata and ready to init data
      .on('ready', () => {
        onReady(apiObject, networkName);
      })
      // On ready: Load all metadata and ready to init data
      .on('error', () => {
        //
      });
  }

  state.apis.substrate[networkName] = apiObject;
}
