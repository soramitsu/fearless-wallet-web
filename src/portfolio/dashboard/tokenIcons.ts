import type { NetworkJson } from '@extension-base/types';
import { parseHoldingKey, sameAssetId } from '@/portfolio/dashboard/holdingKey';
import { POLKASWAP_TOKEN_ICONS } from '@/portfolio/polkaswapTokenIcons';

/** A holding as the dashboard knows it: its portfolio key and the network it is on. */
export interface TokenIconSubject {
  key: string;
  networkName: string;
}

/** The registry network of that name, if the popup has loaded one. */
export type NetworkOf = (name: string) => Pick<NetworkJson, 'assets'> | undefined;

/**
 * A holding's logo. A SORA asset wears the one polkaswap.io shows for its on-chain id, bundled with the app; any other
 * asset, and a SORA asset Polkaswap does not list, wears the registry's. The asset is found by its registry id (an EVM
 * contract in any case), never by its symbol, so a token named like a SORA asset never borrows that asset's logo.
 */
export function tokenIcon(holding: TokenIconSubject, networkOf: NetworkOf): string {
  const parts = parseHoldingKey(holding.key);
  const asset = parts && networkOf(holding.networkName)?.assets.find(({ id }) => sameAssetId(parts.ecosystem, String(id), parts.assetId));

  if (!asset) return '';

  const polkaswap = asset.type === 'soraAsset' && asset.currencyId ? POLKASWAP_TOKEN_ICONS.get(asset.currencyId) : undefined;

  return polkaswap ?? asset.icon ?? '';
}

/** A Tokens-lens row's logo: that of its largest holding that has one. The holdings come largest first. */
export const rowIcon = (holdings: readonly TokenIconSubject[], networkOf: NetworkOf): string =>
  holdings.reduce((found, holding) => found || tokenIcon(holding, networkOf), '');
