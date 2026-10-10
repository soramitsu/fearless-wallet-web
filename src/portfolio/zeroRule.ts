import type { NetworkJson } from '@extension-base/types';
import { DEFAULT_VISIBLE_AT_ZERO, TESTNET_CHAIN_IDS, type ZeroDefaultEntry } from '@/portfolio/canonicalGroups';
import { createAssetKey } from '@/portfolio/assetKey';

type RegistryAsset = NetworkJson['assets'][number];

const ecosystemOf = (network: NetworkJson): string => String(network.ecosystem ?? 'unknown').toLowerCase();
const isEvmEcosystem = (ecosystem: string): boolean => ecosystem === 'evm' || ecosystem.includes('ethereum');

/**
 * `isTestnet(chain) = 'testnet' ∈ options || chainId ∈ testnetChainIds` (portfolio contract §2). The shared list
 * catches test networks the registry ships without the option (CAGA Ankara, Avail Turing, the test relay chains).
 */
export function isTestnetNetwork(network: Pick<NetworkJson, 'chainId' | 'options'>, testnetChainIds = TESTNET_CHAIN_IDS): boolean {
  return (
    Boolean(network.options?.some((option) => String(option).toLowerCase() === 'testnet')) ||
    testnetChainIds.has(String(network.chainId))
  );
}

/** The key `buildPortfolioSections` gives a registry asset of this network. */
export function registryAssetKey(network: NetworkJson, asset: RegistryAsset): string {
  return createAssetKey({
    ecosystem: ecosystemOf(network),
    chainId: String(network.chainId || network.name),
    assetId: String(asset.currencyId ?? asset.id),
  });
}

/** The first `isUtility` asset of a network, else its first `isNative` asset. */
export function primaryUtilityAsset(network: NetworkJson): RegistryAsset | undefined {
  return network.assets.find(({ isUtility }) => Boolean(isUtility)) ?? network.assets.find(({ isNative }) => Boolean(isNative));
}

function findListedAsset(network: NetworkJson, assetId: string): RegistryAsset | undefined {
  const evm = isEvmEcosystem(ecosystemOf(network));
  const wanted = evm ? assetId.toLowerCase() : assetId;

  return network.assets.find(({ id }) => (evm ? String(id).toLowerCase() : String(id)) === wanted);
}

export interface ZeroRuleOptions {
  networks: NetworkJson[];
  /** The listed zero defaults; `undefined` (an unusable bundled file) selects the computed fallback rule. */
  entries?: readonly ZeroDefaultEntry[] | undefined;
  isTestnet?: (network: NetworkJson) => boolean;
  /** The user pinned this network as a favourite. */
  isFavourite?: (network: NetworkJson) => boolean;
  /** The network filter selects exactly this one network. */
  isOnlySelectedNetwork?: (network: NetworkJson) => boolean;
  /** Sending on this network is switched off (compiled off or remotely vetoed). */
  isSendVetoed?: (network: NetworkJson) => boolean;
}

/**
 * The one zero rule shared by Android, iOS and the extension (portfolio contract §4): an Auto asset at zero balance
 * shows only if its network is not a testnet and sending there is not vetoed, and either `(chainId, assetId)` is in
 * the shared `defaultVisibleAtZero` list, or it is the primary utility asset of a network the user pinned or
 * selected as the only network. Whether the wallet holds an account for the network is the caller's wallet scope.
 * Explicit Shown and Hidden are decided before this rule.
 */
export function createZeroDefaultRule({
  networks,
  entries = DEFAULT_VISIBLE_AT_ZERO,
  isTestnet = (network) => isTestnetNetwork(network),
  isFavourite = () => false,
  isOnlySelectedNetwork = () => false,
  isSendVetoed = () => false,
}: ZeroRuleOptions): (network: NetworkJson, assetKey: string) => boolean {
  const listed = new Set<string>();
  const networksByChainId = new Map<string, NetworkJson[]>();

  networks.forEach((network) => {
    const chainId = String(network.chainId);
    networksByChainId.set(chainId, [...(networksByChainId.get(chainId) ?? []), network]);
  });
  entries?.forEach(({ chainId, assetId }) => {
    networksByChainId.get(chainId)?.forEach((network) => {
      const asset = findListedAsset(network, assetId);
      if (asset) listed.add(registryAssetKey(network, asset));
    });
  });

  const primaryKeys = new Map<NetworkJson, string | undefined>();
  const primaryKey = (network: NetworkJson): string | undefined => {
    if (!primaryKeys.has(network)) {
      const asset = primaryUtilityAsset(network);
      primaryKeys.set(network, asset ? registryAssetKey(network, asset) : undefined);
    }

    return primaryKeys.get(network);
  };

  return (network, assetKey) => {
    if (isTestnet(network) || isSendVetoed(network)) return false;
    if (listed.has(assetKey)) return true;
    if (assetKey !== primaryKey(network)) return false;
    if (isFavourite(network) || isOnlySelectedNetwork(network)) return true;

    // Fallback when the bundled list is unusable: the primary utility asset of every ranked mainnet.
    return entries === undefined && Number.isFinite(network.rank);
  };
}
