import type { PortfolioHolding, ResponsePortfolioHoldings } from '@extension-base/background/types/types';
import {
  buildPortfolioSections,
  buildPortfolioSummary,
  type AssetPreference,
  type PortfolioAsset,
  type PortfolioSummaryInput,
} from '@/portfolio/assetIdentity';

/**
 * Whether a row adds to the header total (portfolio contract §3): verified, funded, visible, not on a testnet, and
 * priced with a trusted price. It is the rule `buildPortfolioSummary` applies row by row; the parity test in
 * tests/unit/portfolio-dashboard-holdings.spec.ts keeps the two in step.
 */
export const isCountedAsset = (asset: PortfolioAsset): boolean =>
  !asset.isTestnet &&
  !asset.hidden &&
  asset.trust === 'verified' &&
  asset.hasBalance &&
  asset.priceTrust !== 'unavailable' &&
  asset.fiatValue !== null;

/** Balance times are seconds in some providers and milliseconds in others. */
const toMilliseconds = (timestamp: number): number => (timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);

/**
 * One wallet's header numbers and the holdings behind them. The summary and the holdings come from the same sections
 * and the same hidden keys, so `total` is always the sum of the holdings' fiat. Nothing here writes or signs.
 */
export function buildWalletHoldings(
  address: string,
  input: PortfolioSummaryInput,
  hiddenKeys: readonly string[] = []
): ResponsePortfolioHoldings {
  const preferences: Record<string, AssetPreference> = Object.fromEntries(
    hiddenKeys.map((key) => [key, 'hidden' as const])
  );
  const scoped: PortfolioSummaryInput = { ...input, preferences };
  const summary = buildPortfolioSummary(scoped);
  const sections = buildPortfolioSections({
    ...input,
    preferences,
    mode: 'manage',
    showTestnets: true,
    surfaceDiscoveredAssets: false,
  });
  const holdings: PortfolioHolding[] = [];
  const staleNetworks: string[] = [];
  let latest = 0;

  sections.forEach((section) => {
    let holdsValue = false;

    section.assets.forEach((asset) => {
      if (isCountedAsset(asset)) {
        holdsValue = true;
        holdings.push({
          key: asset.key,
          symbol: asset.symbol,
          name: asset.name,
          networkName: asset.networkName,
          amount: asset.balanceText,
          fiat: asset.fiatValue as string,
          changePercent: asset.priceChangePercent,
        });
        if (asset.timestamp) latest = Math.max(latest, toMilliseconds(asset.timestamp));
      } else if (!asset.isTestnet && !asset.hidden && asset.balanceUnavailable) {
        // Value nobody could load is not counted, but the network that failed to say is the reason the total is partial.
        holdsValue = true;
      }
    });

    if (holdsValue && (section.stale || section.error)) staleNetworks.push(section.name);
  });

  return {
    address,
    total: summary.total,
    changeAmount: summary.changeAmount,
    changePercent: summary.changePercent,
    hiddenCount: summary.hiddenCount,
    unpricedCount: summary.unpricedCount,
    unavailableCount: summary.unavailableCount,
    poolStakesExcluded: summary.poolStakesExcluded,
    holdings,
    ...(latest ? { latestTimestamp: latest } : {}),
    staleNetworks,
  };
}
