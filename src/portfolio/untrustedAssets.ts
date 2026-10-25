import type { NetworkJson } from '@extension-base/types';
import { UNTRUSTED_ASSETS, type UntrustedAssetEntry } from '@/portfolio/canonicalGroups';

type NetworkIdentity = Pick<NetworkJson, 'chainId' | 'ecosystem'>;
export type UntrustedAssetCheck = (network: NetworkIdentity, assetId: unknown) => boolean;

const isEvmEcosystem = (ecosystem: unknown): boolean => {
  const name = String(ecosystem ?? '').toLowerCase();
  return name === 'evm' || name.includes('ethereum');
};

// Registry ids compare exactly, except EVM contract ids (portfolio contract §2).
const entryKey = (chainId: unknown, assetId: unknown, evm: boolean): string => {
  const id = String(assetId ?? '');
  return `${String(chainId ?? '')}\u0000${evm ? id.toLowerCase() : id}`;
};

/**
 * Whether `(chainId, assetId)` is in the shared `untrustedAssets` list (portfolio contract §3). A listed asset has
 * no trusted price: 0 fiat, "Price unavailable", counted under "N assets without price not included", never grouped.
 */
export function createUntrustedAssetCheck(entries: readonly UntrustedAssetEntry[] = UNTRUSTED_ASSETS): UntrustedAssetCheck {
  const exact = new Set(entries.map(({ chainId, assetId }) => entryKey(chainId, assetId, false)));
  const lowercased = new Set(entries.map(({ chainId, assetId }) => entryKey(chainId, assetId, true)));

  return (network, assetId) => {
    const evm = isEvmEcosystem(network.ecosystem);
    return (evm ? lowercased : exact).has(entryKey(network.chainId, assetId, evm));
  };
}

export const isUntrustedAsset: UntrustedAssetCheck = createUntrustedAssetCheck();

/**
 * The network without the registry price of its untrusted assets. Applied where the registry is loaded, so every
 * reader of an asset's or a token group's `priceId` (the list, the header, the asset page, the Send fiat line, the
 * wallet list totals and the price request itself) sees an asset that has no price. Other networks are returned as is.
 */
export function withoutUntrustedPrices<T extends Pick<NetworkJson, 'chainId' | 'ecosystem' | 'assets'>>(
  network: T,
  isUntrusted: UntrustedAssetCheck = isUntrustedAsset
): T {
  if (!network.assets?.some(({ id }) => isUntrusted(network, id))) return network;

  return {
    ...network,
    assets: network.assets.map((asset) => {
      if (!isUntrusted(network, asset.id)) return asset;

      const untrusted = { ...asset, priceId: '' };
      delete untrusted.priceProvider;

      return untrusted;
    }),
  };
}
