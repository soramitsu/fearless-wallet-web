import { forceAssetDiscoverySweep } from '@/extension/messaging/asset-discovery';
import { refreshWalletBalances } from '@/extension/messaging/balance';

/** How long Refresh shows that it is working. Reads that take longer go on, and their balances arrive as they answer. */
export const REFRESH_WAIT_MS = 15_000;

/**
 * Refresh: the selected wallet's balances are read again now, and the networks no wallet follows are searched for
 * tokens. Resolves once the wallet's networks have answered or REFRESH_WAIT_MS has passed, whichever is first; the
 * search goes on by itself. Rejects only when the wallet could not be asked.
 */
export async function refreshWalletBalancesWithin(waitMs = REFRESH_WAIT_MS): Promise<void> {
  void forceAssetDiscoverySweep().catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      refreshWalletBalances(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
