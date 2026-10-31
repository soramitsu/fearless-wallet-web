import type { ResponseTotalBalances } from '@extension-base/background/types/types';
import { FPNumber } from '@/sora/number';
import { getTotalBalances } from '@/extension/messaging';
import { hiddenKeysForWallet } from '@/portfolio/usePortfolioPreferences';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

/** Every wallet's full balance, the given wallets' hidden assets named so the background can say how much of each is hidden. */
export function fetchWalletTotals(addresses: string | string[]): Promise<ResponseTotalBalances[]> {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const hiddenKeysByAddress: Record<string, string[]> = {};

  for (const address of [addresses].flat()) {
    try {
      const hiddenKeys = hiddenKeysForWallet(address, accountsStore.assetPreferencesForAllAccounts[address] ?? {}, networksStore.allNetworks);

      if (hiddenKeys.length) hiddenKeysByAddress[address] = hiddenKeys;
    } catch {
      // Without hidden keys the full total still shows; only the "incl. hidden" label is missing.
    }
  }

  return getTotalBalances(Object.keys(hiddenKeysByAddress).length ? { hiddenKeysByAddress } : null);
}

// The wallet list and the delete confirmation show the full balance; when part of it is hidden in the portfolio, or
// could not be loaded at all (and so is not in it), they say so.
export function walletBalanceCaption(total: ResponseTotalBalances | undefined, t: (key: string) => string): string {
  const hiddenValue = total?.hiddenValue;
  const captions = [
    hiddenValue && new FPNumber(hiddenValue).isGtZero() ? t('portfolioPage.inclHidden') : '',
    total?.unavailableCount ? t('portfolioPage.balanceStatus.failed') : '',
  ];

  return captions.filter(Boolean).join(' · ');
}
