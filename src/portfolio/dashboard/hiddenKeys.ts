import type { NetworkJson } from '@extension-base/types';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import { hiddenKeysForWallet } from '@/portfolio/usePortfolioPreferences';

/**
 * Every wallet's hidden asset keys, so the background can leave them out of each wallet's total as the header does.
 * A wallet whose keys cannot be read is sent without them: it still counts, only its hidden split is missing.
 */
export function hiddenKeysByAddress(
  accounts: ReadonlyArray<{ address: string }>,
  preferencesByAddress: Record<string, Record<string, AssetPreference>>,
  networks: NetworkJson[]
): Record<string, string[]> {
  const byAddress: Record<string, string[]> = {};

  accounts.forEach(({ address }) => {
    try {
      const keys = hiddenKeysForWallet(address, preferencesByAddress[address] ?? {}, networks);

      if (keys.length) byAddress[address] = keys;
    } catch {
      // See above: the wallet's total is then the full one.
    }
  });

  return byAddress;
}
