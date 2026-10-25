import type { ResponsePortfolioHoldings } from '@extension-base/background/types/types';
import { FPNumber } from '@/sora/number';

/** One wallet's read of the dashboard: the background answer plus the name the popup knows it by. */
export interface WalletPortfolio extends ResponsePortfolioHoldings {
  name: string;
}

export interface AggregatedWallet extends WalletPortfolio {
  /** Percent of the all-wallets total. */
  share: number;
}

export interface AggregatePortfolio {
  total: string;
  changeAmount: string;
  changePercent: string;
  hiddenCount: number;
  unpricedCount: number;
  unavailableCount: number;
  poolStakesExcluded: boolean;
  /** Largest first, as the Wallets lens lists them. */
  wallets: AggregatedWallet[];
}

const sum = (values: readonly string[]): FPNumber => values.reduce((acc, value) => acc.add(new FPNumber(value)), FPNumber.ZERO);

/**
 * The all-wallets numbers: the sum of every wallet's own header total, each already computed with that wallet's hidden
 * assets and the same exclusions (portfolio contract §3). The exclusions add up, so the caption names them for the
 * whole set. The 24 h change is the summed change over the summed value a day ago, not an average of percentages.
 */
export function aggregatePortfolios(wallets: readonly WalletPortfolio[]): AggregatePortfolio {
  const total = sum(wallets.map((wallet) => wallet.total));
  const change = sum(wallets.map((wallet) => wallet.changeAmount));
  const prior = total.sub(change);
  const changePercent = prior.isGtZero() ? change.div(prior).mul(FPNumber.HUNDRED) : FPNumber.ZERO;

  return {
    total: total.toString(),
    changeAmount: change.toString(),
    changePercent: changePercent.toString(),
    hiddenCount: wallets.reduce((acc, wallet) => acc + wallet.hiddenCount, 0),
    unpricedCount: wallets.reduce((acc, wallet) => acc + wallet.unpricedCount, 0),
    unavailableCount: wallets.reduce((acc, wallet) => acc + wallet.unavailableCount, 0),
    poolStakesExcluded: wallets.some((wallet) => wallet.poolStakesExcluded),
    wallets: wallets
      .map((wallet) => ({ ...wallet, share: total.isGtZero() ? new FPNumber(wallet.total).div(total).mul(FPNumber.HUNDRED).toNumber() : 0 }))
      .sort((a, b) => new FPNumber(b.total).sub(new FPNumber(a.total)).toNumber() || a.name.localeCompare(b.name)),
  };
}
