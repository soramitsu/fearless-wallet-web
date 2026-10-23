import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

/** How long the popup waits for the selected wallet to change after it has asked the background to switch. */
export const WALLET_SWITCH_TIMEOUT_MS = 4000;
/** How long it then waits for the app's own redirect to the portfolio to land. */
export const REDIRECT_SETTLE_MS = 1500;

/**
 * Acting on a holding of a wallet that is not selected switches to that wallet first (design spec 4.2): the Send, Receive,
 * swap and cross-chain screens all work on the selected wallet. It asks the background, waits for the popup's own copy of
 * the selected wallet to follow, and says when it did not.
 *
 * The app sends every wallet change to the portfolio (App.vue, `onAccountUpdate`), so a screen opened straight after the
 * change would be overtaken by that redirect. The switch therefore also waits for the redirect to land (or not to come),
 * and only then returns, so the caller's navigation is the last one.
 */
export function useWalletSwitch() {
  const accountsStore = useAccountsStore();
  const router = useRouter();
  /** The name of the wallet being switched to, while it is. */
  const switching = ref<string | null>(null);
  const failed = ref(false);

  // The background may publish the change before its answer to the switch arrives, so the current value counts too.
  const selectedBecomes = (address: string): Promise<boolean> => {
    if (accountsStore.selectedWallet.address === address) return Promise.resolve(true);

    return new Promise((resolve) => {
      const done = (arrived: boolean) => {
        clearTimeout(timer);
        stop();
        resolve(arrived);
      };
      const stop = watch(
        () => accountsStore.selectedWallet.address,
        (selected) => {
          if (selected === address) done(true);
        }
      );
      const timer = setTimeout(() => done(false), WALLET_SWITCH_TIMEOUT_MS);
    });
  };

  const redirectSettles = (from: string): Promise<void> =>
    new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        stop();
        resolve();
      };
      const timer = setTimeout(done, REDIRECT_SETTLE_MS);
      const stop = watch(
        () => router.currentRoute.value.fullPath,
        (path) => {
          if (path !== from) done();
        }
      );
    });

  async function switchTo(address: string): Promise<boolean> {
    if (address === accountsStore.selectedWallet.address) return true;

    const account = accountsStore.accounts.find((candidate) => candidate.address === address);

    // A wallet that is no longer in the list cannot be switched to; say so rather than doing nothing.
    if (!account) {
      failed.value = true;

      return false;
    }

    switching.value = account.name;
    failed.value = false;

    try {
      const from = router.currentRoute.value.fullPath;

      await updateCurrentAccount(address, account.walletEcosystem);
      failed.value = !(await selectedBecomes(address));
      if (!failed.value) await redirectSettles(from);
    } catch {
      failed.value = true;
    } finally {
      switching.value = null;
    }

    return !failed.value;
  }

  return { switching, failed, switchTo };
}
