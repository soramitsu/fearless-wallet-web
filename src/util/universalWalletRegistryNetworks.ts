import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { NetworkJson, Asset, NetworkEcosystem } from '@extension-base/types';
import { TON_MAINNET } from '@/consts/networks';
import { UNIVERSAL_WALLET_CHAIN_REGISTRY, UNIVERSAL_WALLET_NATIVE_PRICE_IDS } from '@/consts/universalWallet';
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
const SHARED_ICONS_URL = 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons';
// shared-features-utils publishes no Solana icon, so the extension bundles one at the same relative path.
const BUNDLED_ICONS_PATH = '/icons';
// Icons for registry chains the remote chain catalog does not list yet; other entries keep their symbol.
const REGISTRY_TOKEN_ICONS: Partial<Record<string, string>> = {
  BTC: `${SHARED_ICONS_URL}/tokens/coloured/BTC.svg`,
  SOL: `${BUNDLED_ICONS_PATH}/tokens/coloured/SOL.svg`,
  XOR: `${SHARED_ICONS_URL}/tokens/coloured/XOR.svg`,
};
// Tokens the extension names, prices and pictures itself on networks whose registry entry lists only the coin. A
// token not listed here still shows, named by its mint.
const REGISTRY_TOKEN_ASSETS: Readonly<Partial<Record<string, readonly Asset[]>>> = Object.freeze({
  'solana:mainnet': [
    createRegistryTokenAsset('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 6, 'usd-coin'),
    createRegistryTokenAsset('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT', 'Tether USD', 6, 'tether'),
  ],
});
const REGISTRY_NETWORK_ICONS: Partial<Record<string, string>> = {
  [WalletEcosystem.Bitcoin]: REGISTRY_TOKEN_ICONS.BTC,
  [WalletEcosystem.Iroha]: `${SHARED_ICONS_URL}/chains/white/SORA.svg`,
  [WalletEcosystem.Solana]: REGISTRY_TOKEN_ICONS.SOL,
};

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
        currentProvider: storedNetwork?.currentProvider || registryNetwork.currentProvider,
        customNodes: storedNetwork?.customNodes ?? registryNetwork.customNodes,
        customProviders: storedNetwork?.customProviders ?? registryNetwork.customProviders,
        isManual: storedNetwork?.isManual,
        favorite: storedNetwork?.favorite ?? registryNetwork.favorite,
      };

      continue;
    }

    networkMap[existingKey] = mergeRegistryNetworkDefaults(networkMap[existingKey], registryNetwork, storedNetwork);
  }
}

/**
 * Produces the discovery catalog from maintained sources only. The remote
 * chain catalog remains authoritative for chains it knows about, while the
 * bundled universal-wallet registry supplies production ecosystems that are
 * not published there yet. User-created networkMap entries are deliberately
 * not an input.
 */
function createAuthoritativeDiscoveryRegistryNetworks(
  remoteNetworks: NetworkJson[],
  registry: UniversalWalletChainRegistry = UNIVERSAL_WALLET_CHAIN_REGISTRY
): NetworkJson[] {
  const authoritativeMap: UniversalWalletNetworkMap = {};

  for (const network of remoteNetworks) {
    const existingKey = findExistingNetworkKey(authoritativeMap, network);

    if (!existingKey) authoritativeMap[network.name] = network;
  }

  mergeUniversalWalletRegistryNetworks(authoritativeMap, undefined, registry);

  return Object.values(authoritativeMap);
}

function createNetworkFromRegistryEntry(entry: UniversalWalletChainRegistryEntry): NetworkJson {
  const name = getRuntimeNetworkName(entry);
  const nodes = createNodes(entry.endpoints);
  const providers = Object.fromEntries(nodes.map(({ name, url }) => [name, url]));
  const currentProvider = nodes[0]?.name ?? '';
  const nativeAsset = entry.nativeAsset ? [createNativeAsset(entry)] : [];
  // A copy per network, as the native asset is, so no network shares an asset object with another.
  const tokenAssets = (REGISTRY_TOKEN_ASSETS[entry.chainId] ?? []).map((asset) => ({ ...asset }));
  const active = entry.enabledByDefault && nodes.length > 0;

  return {
    key: name,
    chain: name,
    icon: REGISTRY_NETWORK_ICONS[entry.ecosystem] ?? entry.nativeAsset?.symbol.toLowerCase() ?? entry.ecosystem,
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
    assets: [...nativeAsset, ...tokenAssets],
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
    icon: pickIcon(existing.icon, registryNetwork.icon),
    key: existing.key || registryNetwork.key,
    chain: existing.chain || registryNetwork.chain,
    chainId:
      registryNetwork.ecosystem === WalletEcosystem.Iroha
        ? registryNetwork.chainId
        : existing.chainId || registryNetwork.chainId,
    ecosystem: registryNetwork.ecosystem,
    externalApi: mergeExternalApi(existing.externalApi, registryNetwork.externalApi),
    assets: mergeRegistryTokenAssets(mergeNativeAssets(existing.assets, registryNetwork.assets), registryNetwork.assets),
    nodes: existing.nodes?.length ? existing.nodes : registryNetwork.nodes,
    providers: Object.keys(existing.providers ?? {}).length ? existing.providers : registryNetwork.providers,
    currentProvider: existing.currentProvider || registryNetwork.currentProvider,
    customNodes: existing.customNodes ?? registryNetwork.customNodes,
    customProviders: existing.customProviders ?? registryNetwork.customProviders,
    isManual: existing.isManual,
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

  const isRegistryNative = ({ id, isNative, isUtility, symbol }: Asset) =>
    isNative || isUtility || isSameString(id, nativeAsset.id) || isSameString(symbol, nativeAsset.symbol);

  if (!existingAssets.some(isRegistryNative)) return [nativeAsset, ...existingAssets];

  return existingAssets.map((asset) =>
    isRegistryNative(asset)
      ? {
          ...asset,
          icon: pickIcon(asset.icon, nativeAsset.icon),
          // Stored test networks may still carry the mainnet price id from earlier releases.
          priceId: nativeAsset.priceId ? asset.priceId : '',
        }
      : asset
  );
}

// Earlier releases stored bare symbols that never resolve to an image; a published or bundled icon replaces them.
function pickIcon(existingIcon: string, registryIcon: string): string {
  const isIconUrl = (icon: string) =>
    (icon?.startsWith('https://') || icon?.startsWith(`${BUNDLED_ICONS_PATH}/`)) ?? false;

  return !isIconUrl(existingIcon) && isIconUrl(registryIcon) ? registryIcon : existingIcon;
}

// A stored network gains the registry tokens it does not list yet; an entry it already has for a mint is kept.
// Mints are case-sensitive base58, so they are compared exactly.
function mergeRegistryTokenAssets(existingAssets: Asset[], registryAssets: Asset[]): Asset[] {
  const missing = registryAssets.filter(
    ({ id, isNative, isUtility }) => !isNative && !isUtility && !existingAssets.some((asset) => asset.id === id)
  );

  return missing.length ? [...existingAssets, ...missing] : existingAssets;
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

function createNativeAsset(entry: UniversalWalletChainRegistryEntry): Asset {
  const { ecosystem, nativeAsset } = entry;
  const symbol = nativeAsset?.symbol ?? 'UNKNOWN';

  return {
    id: nativeAsset?.id ?? symbol,
    type: ecosystem as Asset['type'],
    name: nativeAsset?.name ?? symbol,
    symbol,
    currencyId: nativeAsset?.id ?? symbol,
    precision: nativeAsset?.decimals ?? 0,
    // Test-network coins share a mainnet symbol but have no market value.
    priceId: isTestnetEntry(entry) ? '' : UNIVERSAL_WALLET_NATIVE_PRICE_IDS[entry.chainId] ?? '',
    icon: REGISTRY_TOKEN_ICONS[symbol] ?? symbol.toLowerCase(),
    color: '',
    staking: '',
    isUtility: true,
    isNative: true,
    tonType: 'normal',
  };
}

function createRegistryTokenAsset(mint: string, symbol: string, name: string, precision: number, priceId: string): Asset {
  return {
    id: mint,
    type: WalletEcosystem.Solana as Asset['type'],
    name,
    symbol,
    currencyId: mint,
    precision,
    priceId,
    icon: `${SHARED_ICONS_URL}/tokens/coloured/${symbol}.svg`,
    color: '',
    staking: '',
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
    return (
      entry.endpoints.find(({ kind }) => kind === 'torii') ?? entry.endpoints.find(({ kind }) => kind === 'torii-mcp')
    );
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

function isTestnetEntry(entry: UniversalWalletChainRegistryEntry): boolean {
  const descriptor = `${entry.id} ${entry.chainId} ${entry.displayName}`.toLowerCase();

  return descriptor.includes('testnet') || descriptor.includes('devnet');
}

function getRuntimeOptions(entry: UniversalWalletChainRegistryEntry): NetworkJson['options'] {
  return isTestnetEntry(entry) ? ['testnet'] : undefined;
}

export {
  createUniversalWalletRegistryNetworks,
  createAuthoritativeDiscoveryRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
  createNetworkFromRegistryEntry,
};
