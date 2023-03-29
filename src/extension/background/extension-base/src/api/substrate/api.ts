// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise, WsProvider } from '@polkadot/api';
import { TypeRegistry } from '@polkadot/types/create';
import { ChainProperties, ChainType } from '@polkadot/types/interfaces';
import { Registry } from '@polkadot/types/types';
import { formatBalance, isTestChain, objectSpread } from '@polkadot/util';
import { defaults as addressDefaults } from '@polkadot/util-crypto/address/defaults';
import { ApiState, ApiProps } from '../../background/types';
import { DOTSAMA_AUTO_CONNECT_MS, DOTSAMA_MAX_CONTINUE_RETRY } from '../../const/intervals';
export const DEFAULT_AUX = ['Aux1', 'Aux2', 'Aux3', 'Aux4', 'Aux5', 'Aux6', 'Aux7', 'Aux8', 'Aux9'];

interface ChainData {
  properties: ChainProperties;
  systemChain: string;
  systemChainType: ChainType;
  systemName: string;
  systemVersion: string;
}

async function retrieve(registry: Registry, api: ApiPromise): Promise<ChainData> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [systemChain, systemChainType, systemName, systemVersion] = await Promise.all([
    api.rpc.system?.chain(),
    api.rpc.system?.chainType ? api.rpc.system?.chainType() : Promise.resolve(registry.createType('ChainType', 'Live')),
    api.rpc.system?.name(),
    api.rpc.system?.version(),
  ]);

  return {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    properties: registry.createType('ChainProperties', {
      ss58Format: api.registry.chainSS58,
      tokenDecimals: api.registry.chainDecimals,
      tokenSymbol: api.registry.chainTokens,
    }),
    systemChain: (systemChain || '<unknown>').toString(),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    systemChainType,
    systemName: systemName.toString(),
    systemVersion: systemVersion.toString(),
  };
}

async function loadOnReady(registry: Registry, api: ApiPromise): Promise<ApiState> {
  const DEFAULT_DECIMALS = registry.createType('u32', 12);
  const DEFAULT_SS58 = registry.createType('u32', addressDefaults.prefix);
  const { properties, systemChain, systemChainType, systemName, systemVersion } = await retrieve(registry, api);
  const ss58Format = properties.ss58Format.unwrapOr(DEFAULT_SS58).toNumber();
  const tokenSymbol = properties.tokenSymbol.unwrapOr([formatBalance.getDefaults().unit, ...DEFAULT_AUX]);
  const tokenDecimals = properties.tokenDecimals.unwrapOr([DEFAULT_DECIMALS]);
  const isDevelopment = systemChainType.isDevelopment || systemChainType.isLocal || isTestChain(systemChain);

  // console.info(`chain: ${systemChain} (${systemChainType.toString()}), ${stringify(properties)}`);

  // explicitly override the ss58Format as specified
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  registry.setChainProperties(registry.createType('ChainProperties', { ss58Format, tokenDecimals, tokenSymbol }));

  // first setup the UI helpers
  const defaultFormatBalance = {
    decimals: tokenDecimals.map((b) => b.toNumber()),
    unit: tokenSymbol[0].toString(),
  };

  const defaultSection = Object.keys(api.tx)[0];
  const defaultMethod = Object.keys(api.tx[defaultSection])[0];
  const apiDefaultTx = api.tx[defaultSection][defaultMethod];
  const apiDefaultTxSudo = (api.tx.system && api.tx.system.setCode) || apiDefaultTx;

  return {
    defaultFormatBalance,
    registry,
    apiDefaultTx,
    apiDefaultTxSudo,
    isApiReady: true,
    isApiInitialized: true,
    isDevelopment: isDevelopment,
    specName: api.runtimeVersion.specName.toString(),
    specVersion: api.runtimeVersion.specVersion.toString(),
    systemChain,
    systemName,
    systemVersion,
  };
}

function createApiObject(api: ApiPromise, apiUrl: string, isEthereum: boolean, registry: TypeRegistry) {
  const result: ApiProps = {
    api,
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
    recoverConnect: async () => {
      result.apiRetry = 0;
    },
    get isReady() {
      const self = this as ApiProps;

      return (async function (): Promise<ApiProps> {
        if (!result.isApiInitialized) {
          await self.api.isReady;
        }

        return new Promise<ApiProps>((resolve) => {
          (function wait() {
            if (self.isApiReady) {
              return resolve(self);
            }

            setTimeout(wait, 33);
          })();
        });
      })();
    },
  } as unknown as ApiProps;

  return result;
}

function generateEvmHttpApi(apiUrl: string, registry: Registry): ApiProps {
  return {
    api: new Proxy(
      {},
      {
        get(target, prop, receiver) {
          console.info('Access virtual API', target, prop, receiver);
        },
      }
    ),
    apiDefaultTx: undefined,
    apiDefaultTxSudo: undefined,
    apiError: undefined,
    apiUrl,
    defaultFormatBalance: undefined,
    isApiConnected: true,
    isApiReady: true,
    isApiInitialized: true,
    isEthereum: true,
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

function onDisconnect(apiObject: ApiProps, provider: WsProvider) {
  apiObject.apiRetry = (apiObject.apiRetry || 0) + 1;
  apiObject.isApiConnected = false;
  apiObject.isApiReady = false; // result.isApiInitialized && result.isApiConnected

  // console.info(`DotSamaAPI disconnected from ${JSON.stringify(apiUrl)} ${JSON.stringify(result.apiRetry)} times`);

  if (apiObject.apiRetry > DOTSAMA_MAX_CONTINUE_RETRY) {
    // console.info(`Discontinue to use ${JSON.stringify(apiUrl)} because max retry`);
    provider.disconnect().then(console.info).catch(console.error);
  } else {
    // Todo: Implement reconnect api here
  }
}

function onConnected(apiObject: ApiProps) {
  apiObject.apiRetry = 0;
  apiObject.isApiConnected = true;
  apiObject.isApiReady = apiObject.isApiInitialized; // result.isApiInitialized && result.isApiConnected
}

function onReady(apiObject: ApiProps, api: ApiPromise, registry: Registry) {
  loadOnReady(registry, api)
    .then((rs) => {
      objectSpread(apiObject, rs);
    })
    .catch((error): void => {
      apiObject.apiError = (error as Error).message;
    });
}

export function initApi(networkKey: string, apiUrl: string, isEthereum = false): ApiProps {
  const registry = new TypeRegistry();

  if (isEthereum) {
    // return EVM HTTP Placeholder
    return generateEvmHttpApi(apiUrl, registry);
  }

  const provider = new WsProvider(apiUrl, DOTSAMA_AUTO_CONNECT_MS);

  // Init ApiPromise with selected provider
  const api = new ApiPromise({ provider, noInitWarn: true });

  // Create APIProps Object
  const apiObject: ApiProps = createApiObject(api, apiUrl, isEthereum, registry);

  // Listen ApiPromise events
  // On connected: provider is connected
  api
    .on('connected', () => {
      onConnected(apiObject);
    })
    // On disconnected: provider is disconnected
    .on('disconnected', () => {
      onDisconnect(apiObject, provider);
    })
    // On ready: Load all metadata and ready to init data
    .on('ready', () => {
      onReady(apiObject, api, registry);
    })
    // On ready: Load all metadata and ready to init data
    .on('error', console.error);

  return apiObject;
}
