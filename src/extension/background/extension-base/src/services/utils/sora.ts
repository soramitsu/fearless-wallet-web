import type { Api as LocalSoraApi } from '@sora/api';
import { FPNumber } from '@/lib/fpNumber';

type SoraUtilModule = typeof import('@sora');
type PoolXykModuleCtor = (typeof import('@sora/poolXyk'))['PoolXykModule'];

type LoaderOverrides = {
  loadSora?: () => Promise<SoraUtilModule>;
  loadPoolXyk?: () => Promise<PoolXykModuleCtor>;
  resetState?: boolean;
};

const defaultSoraLoader = (): Promise<SoraUtilModule> => import('@sora');
const defaultPoolXykLoader = (): Promise<PoolXykModuleCtor> =>
  import('@sora/poolXyk').then((module) => module.PoolXykModule);

let dynamicSoraLoader: () => Promise<SoraUtilModule> = defaultSoraLoader;
let dynamicPoolXykLoader: () => Promise<PoolXykModuleCtor> = defaultPoolXykLoader;

let soraModulePromise: Promise<SoraUtilModule> | null = null;
let soraModule: SoraUtilModule | null = null;
let poolXykCtorPromise: Promise<PoolXykModuleCtor> | null = null;

const resetState = () => {
  soraModulePromise = null;
  soraModule = null;
  poolXykCtorPromise = null;
};

const loadPoolXykCtor = async (): Promise<PoolXykModuleCtor> => {
  if (!poolXykCtorPromise) {
    poolXykCtorPromise = dynamicPoolXykLoader().catch((error) => {
      poolXykCtorPromise = null;
      throw error;
    });
  }

  return poolXykCtorPromise;
};

const patchSoraModule = async (module: SoraUtilModule): Promise<SoraUtilModule> => {
  const api = module.api as unknown as LocalSoraApi<unknown> & { poolXyk?: unknown };
  const PoolXykModule = await loadPoolXykCtor();

  if ('PoolXykModule' in module && (module as any).PoolXykModule !== PoolXykModule) {
    (module as any).PoolXykModule = PoolXykModule;
  }

  if (!(api?.poolXyk instanceof PoolXykModule)) {
    api.poolXyk = new PoolXykModule(api as LocalSoraApi<unknown>);
  }

  return module;
};

const loadModule = async (): Promise<SoraUtilModule> => {
  if (soraModule) return soraModule;

  if (!soraModulePromise) {
    soraModulePromise = dynamicSoraLoader()
      .then((loaded) => patchSoraModule(loaded))
      .catch((error) => {
        soraModulePromise = null;
        throw error;
      });
  }

  const loadedModule = await soraModulePromise;
  soraModule = loadedModule;

  return loadedModule;
};

export const getSoraUtil = async (): Promise<SoraUtilModule> => loadModule();

export const getSoraUtilOrThrow = (): SoraUtilModule => {
  if (!soraModule) throw new Error('Sora utilities accessed before initialization');

  return soraModule;
};

export const getSoraApi = async (): Promise<SoraUtilModule['api']> => {
  const { api } = await loadModule();

  return api;
};

export const getFPNumberCtor = async (): Promise<typeof FPNumber> => FPNumber;

export const getSoraConnection = async (): Promise<SoraUtilModule['connection']> => {
  const { connection } = await loadModule();

  return connection;
};

export const getCachedSoraUtil = (): SoraUtilModule | null => soraModule;

export const __setSoraLoadersForTesting = (overrides?: LoaderOverrides): void => {
  dynamicSoraLoader = overrides?.loadSora ?? defaultSoraLoader;
  dynamicPoolXykLoader = overrides?.loadPoolXyk ?? defaultPoolXykLoader;

  if (overrides?.resetState) {
    resetState();
  }
};

export type { SoraUtilModule, PoolXykModuleCtor };
