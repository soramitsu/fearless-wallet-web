import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { NetworkJson, Asset, NetworkEcosystem } from '@extension-base/types';
import { TON_MAINNET } from '@/consts/networks';
import { UNIVERSAL_WALLET_CHAIN_REGISTRY } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';
import {
  validateUniversalWalletChainRegistry,
  type UniversalWalletChainRegistry,
  type UniversalWalletChainRegistryEntry,
  type UniversalWalletRegistryEndpoint,
} from '@/util/universalWalletRegistryContract';

type UniversalWalletNetworkMap = Record<string, NetworkJson>;

const TAIRA_TESTNET_NETWORK_NAME = 'Taira Testnet';
const DEFAULT_ADDRESS_PREFIX = 42;

function createUniversalWalletRegistryNetworks(
  registry: UniversalWalletChainRegistry = UNIVERSAL_WALLET_CHAIN_REGISTRY
): NetworkJson[] {
  const validationErrors = validateUniversalWalletChainRegistry(registry);

  if (validationErrors.length) {
    throw new Error(`invalid_universal_wallet_registry:${validationErrors.join(',')}`);
  }

  return registry.chains.map(createNetworkFromRegistryEntry);
}

function mergeUniversalWalletRegistryNetworks(
  networkMap: UniversalWalletNetworkMap,
  storedNetworks: Record<string, NetworkJson> | undefined,
  registry: UniversalWalletChainRegistry = UNIVERSAL_WALLET_CHAIN_REGISTRY
): void {
  for (const registryNetwork of createUniversalWalletRegistryNetworks(registry)) {
    const existingKey = findExistingNetworkKey(networkMap, registryNetwork);
    const storedNetwork = storedNetworks?.[existingKey ?? registryNetwork.name] ?? storedNetworks?.[registryNetwork.name];

    if (!existingKey) {
      networkMap[registryNetwork.name] = {
        ...registryNetwork,
        favorite: storedNetwork?.favorite ?? registryNetwork.favorite,
      };

      continue;
    }

    networkMap[existingKey] = mergeRegistryNetworkDefaults(networkMap[existingKey], registryNetwork, storedNetwork);
  }
}

function createNetworkFromRegistryEntry(entry: UniversalWalletChainRegistryEntry): NetworkJson {
  const name = getRuntimeNetworkName(entry);
  const nodes = createNodes(entry.endpoints);
  const providers = Object.fromEntries(nodes.map(({ name, url }) => [name, url]));
  const currentProvider = nodes[0]?.name ?? '';
  const nativeAsset = entry.nativeAsset ? [createNativeAsset(entry)] : [];
  const active = entry.enabledByDefault && nodes.length > 0;

  return {
    key: name,
    chain: name,
    icon: entry.nativeAsset?.symbol.toLowerCase() ?? entry.ecosystem,
    active,
    providers,
    currentProvider,
    customProviders: {},
    genesisHash: `0x${entry.chainId}`,
    ss58Format: DEFAULT_ADDRESS_PREFIX,
    disabled: !entry.enabledByDefault,
    networkStatus: active ? NETWORK_STATUS.DISCONNECTED : undefined,
    chainId: entry.chainId,
    name,
    externalApi: createExternalApi(entry),
    assets: nativeAsset,
    customNodes: [],
    nodes,
    addressPrefix: DEFAULT_ADDRESS_PREFIX,
    ecosystem: entry.ecosystem as NetworkEcosystem,
    types: { name, url: '' },
    options: getRuntimeOptions(entry),
    favorite: [],
  };
}

function mergeRegistryNetworkDefaults(
  existing: NetworkJson,
  registryNetwork: NetworkJson,
  storedNetwork: NetworkJson | undefined
): NetworkJson {
  return {
    ...existing,
    key: existing.key || registryNetwork.key,
    chain: existing.chain || registryNetwork.chain,
    chainId: existing.chainId || registryNetwork.chainId,
    ecosystem: registryNetwork.ecosystem,
    externalApi: mergeExternalApi(existing.externalApi, registryNetwork.externalApi),
    assets: mergeNativeAssets(existing.assets, registryNetwork.assets),
    nodes: existing.nodes?.length ? existing.nodes : registryNetwork.nodes,
    providers: Object.keys(existing.providers ?? {}).length ? existing.providers : registryNetwork.providers,
    currentProvider: existing.currentProvider || registryNetwork.currentProvider,
    customNodes: existing.customNodes ?? registryNetwork.customNodes,
    favorite: storedNetwork?.favorite ?? existing.favorite ?? registryNetwork.favorite,
  };
}

function mergeExternalApi(
  existing: NetworkJson['externalApi'],
  registryExternalApi: NetworkJson['externalApi']
): NetworkJson['externalApi'] {
  if (!registryExternalApi?.history) return existing;

  return {
    ...(existing ?? {}),
    history: registryExternalApi.history,
  } as NetworkJson['externalApi'];
}

function mergeNativeAssets(existingAssets: Asset[], registryAssets: Asset[]): Asset[] {
  const nativeAsset = registryAssets[0];

  if (!nativeAsset) return existingAssets;

  const hasNativeAsset = existingAssets.some(({ id, isNative, isUtility, symbol }) => {
    return isNative || isUtility || isSameString(id, nativeAsset.id) || isSameString(symbol, nativeAsset.symbol);
  });

  return hasNativeAsset ? existingAssets : [nativeAsset, ...existingAssets];
}

function findExistingNetworkKey(networkMap: UniversalWalletNetworkMap, registryNetwork: NetworkJson): string | undefined {
  return Object.entries(networkMap).find(([, network]) => {
    return (
      isSameString(network.name, registryNetwork.name) ||
      isSameString(network.chainId, registryNetwork.chainId) ||
      isSameString(network.key, registryNetwork.key)
    );
  })?.[0];
}

function createNativeAsset({ ecosystem, nativeAsset }: UniversalWalletChainRegistryEntry): Asset {
  const symbol = nativeAsset?.symbol ?? 'UNKNOWN';

  return {
    id: nativeAsset?.id ?? symbol,
    type: ecosystem as Asset['type'],
    name: nativeAsset?.name ?? symbol,
    symbol,
    currencyId: nativeAsset?.id ?? symbol,
    precision: nativeAsset?.decimals ?? 0,
    priceId: symbol.toLowerCase(),
    icon: symbol.toLowerCase(),
    color: '',
    staking: '',
    isUtility: true,
    isNative: true,
    tonType: 'normal',
  };
}

function createNodes(endpoints: UniversalWalletRegistryEndpoint[]): NetworkJson['nodes'] {
  return endpoints
    .filter(({ kind }) => kind !== 'indexer')
    .map(({ id, url }) => ({
      name: id,
      url,
    }));
}

function createExternalApi(entry: UniversalWalletChainRegistryEntry): NetworkJson['externalApi'] {
  const historyEndpoint = getHistoryEndpoint(entry);

  if (!historyEndpoint) return undefined;

  return {
    history: {
      type: getHistoryType(entry.ecosystem),
      url: historyEndpoint.url,
    },
  } as NetworkJson['externalApi'];
}

function getHistoryEndpoint(entry: UniversalWalletChainRegistryEntry): UniversalWalletRegistryEndpoint | undefined {
  if (entry.ecosystem === WalletEcosystem.Iroha) {
    return entry.endpoints.find(({ kind }) => kind === 'torii-mcp');
  }

  return entry.endpoints.find(({ kind }) => kind === 'indexer');
}

function getHistoryType(ecosystem: string): NonNullable<NonNullable<NetworkJson['externalApi']>['history']>['type'] {
  if (ecosystem === WalletEcosystem.Bitcoin) return 'bitcoin';
  if (ecosystem === WalletEcosystem.Iroha) return 'iroha';
  if (ecosystem === WalletEcosystem.Solana) return 'solana';
  if (ecosystem === WalletEcosystem.Ton) return 'ton';

  return 'subsquid';
}

function getRuntimeNetworkName(entry: UniversalWalletChainRegistryEntry): string {
  if (entry.id === 'ton-mainnet') return TON_MAINNET;
  if (entry.id === 'taira-testnet') return TAIRA_TESTNET_NETWORK_NAME;

  return entry.displayName;
}

function getRuntimeOptions(entry: UniversalWalletChainRegistryEntry): NetworkJson['options'] {
  const descriptor = `${entry.id} ${entry.chainId} ${entry.displayName}`.toLowerCase();

  return descriptor.includes('testnet') || descriptor.includes('devnet') ? ['testnet'] : undefined;
}

export {
  createUniversalWalletRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
  createNetworkFromRegistryEntry,
};
