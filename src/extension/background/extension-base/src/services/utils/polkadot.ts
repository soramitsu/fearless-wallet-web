import type { ApiPromise } from '@polkadot/api';
import type { WsProvider } from '@polkadot/rpc-provider';

type PolkadotApiModule = typeof import('@polkadot/api');
type PolkadotRpcModule = typeof import('@polkadot/rpc-provider');

let apiModulePromise: Promise<PolkadotApiModule> | null = null;
let rpcModulePromise: Promise<PolkadotRpcModule> | null = null;
let cachedApiModule: PolkadotApiModule | null = null;
let cachedRpcModule: PolkadotRpcModule | null = null;

const loadPolkadotApiModule = async (): Promise<PolkadotApiModule> => {
  if (cachedApiModule) return cachedApiModule;

  if (!apiModulePromise) {
    apiModulePromise = import('@polkadot/api');
  }

  cachedApiModule = await apiModulePromise;

  return cachedApiModule;
};

const loadPolkadotRpcModule = async (): Promise<PolkadotRpcModule> => {
  if (cachedRpcModule) return cachedRpcModule;

  if (!rpcModulePromise) {
    rpcModulePromise = import('@polkadot/rpc-provider');
  }

  cachedRpcModule = await rpcModulePromise;

  return cachedRpcModule;
};

export const getPolkadotApiModule = async (): Promise<PolkadotApiModule> => loadPolkadotApiModule();

export const getApiPromiseCtor = async (): Promise<typeof ApiPromise> => {
  const { ApiPromise: ApiPromiseCtor } = await loadPolkadotApiModule();

  return ApiPromiseCtor;
};

export const getPolkadotRpcModule = async (): Promise<PolkadotRpcModule> => loadPolkadotRpcModule();

export const getWsProviderCtor = async (): Promise<typeof WsProvider> => {
  const { WsProvider: WsProviderCtor } = await loadPolkadotRpcModule();

  return WsProviderCtor;
};

export const getCachedPolkadotApiModule = (): PolkadotApiModule | null => cachedApiModule;
export const getCachedPolkadotRpcModule = (): PolkadotRpcModule | null => cachedRpcModule;
