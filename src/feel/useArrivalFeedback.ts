// Tokens arriving, felt (brand kit v3, SPEC part 2): the receive sound, a gold pulse on the balance card and the app's
// own toast, when collectHoldings/createArrivalTracker say something arrived. One watcher per page, started once the
// wallet is mounted (src/bootstrap/mountApp.ts) and kept for the page's life; a hidden page shows nothing.
import { effectScope, getCurrentScope, onScopeDispose, watch, type App, type EffectScope } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import { collectHoldings, createArrivalTracker, type Arrival } from '@/feel/arrivals';
import { arrivalPulse, lastArrival } from '@/feel/arrivalPulse';
import { playSound, prepareSounds } from '@/feel/sound';
import { formatDecimalString } from '@/helpers/numbers';
import { FPNumber } from '@/sora/number';
import { i18n } from '@/locales';
import { useNotify } from '@/plugins/soramitsuUI';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { IS_EXTENSION_SMOKE, IS_TEST_ONLY } from '@/consts/global';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

let shared: { scope: EffectScope; users: number } | undefined;

/** Starts the page's watcher inside the app's context (its stores). */
export function startArrivalFeedback(app: App): void {
  app.runWithContext(() => useArrivalFeedback());
}

export function useArrivalFeedback(): void {
  if (!shared) {
    const scope = effectScope(true);
    shared = { scope, users: 0 };
    scope.run(watchArrivals);
  }
  const current = shared;
  if (!getCurrentScope()) return;
  current.users += 1;
  onScopeDispose(() => {
    current.users -= 1;
    if (current.users > 0) return;
    current.scope.stop();
    if (shared === current) shared = undefined;
  });
}

function watchArrivals(): void {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const { hiddenKeys } = usePortfolio();
  const notify = useNotify();
  const tracker = createArrivalTracker();
  const t = i18n.global.t;

  prepareSounds();

  const show = (arrival: Arrival) => {
    arrivalPulse.value += 1;
    lastArrival.value = arrival;
    void playSound('receive');
    const amount = formatDecimalString(arrival.amount, { maximumFractionDigits: 6, preserveSmallValue: true });
    notify({
      title: t('feel.received'),
      message: arrival.others
        ? t('feel.receivedMore', { amount, symbol: arrival.symbol, count: arrival.others })
        : t('feel.receivedAmount', { amount, symbol: arrival.symbol }),
      type: 'success',
    });
  };

  watch(
    () => accountsStore.selectedWallet.address,
    () => tracker.reset(Date.now())
  );
  watch(
    [() => accountsStore.balances, () => networksStore.allNetworks, hiddenKeys],
    () => {
      const arrival = tracker.observe(
        accountsStore.selectedWallet.address,
        collectHoldings(accountsStore.balances as unknown as TokenGroup[], networksStore.allNetworks, hiddenKeys.value),
        {
          now: Date.now(),
          visible: globalThis.document?.visibilityState !== 'hidden',
          settling: accountsStore.isBalanceLoading,
        }
      );
      if (arrival) show(arrival);
    },
    { immediate: true }
  );

  // Harness builds only: grows one loaded balance of the selected wallet in the page's store, so a smoke can watch the
  // real rule fire without real funds. The background's next update puts the true amount back.
  if (IS_TEST_ONLY || IS_EXTENSION_SMOKE) {
    (globalThis as { __fwFeel?: unknown }).__fwFeel = {
      growBalance(symbol: string, amount = '1') {
        const groups = (accountsStore.balances as unknown as TokenGroup[]).map((group) => ({
          ...group,
          balances: group.balances.map((balance) => ({ ...balance })),
        }));
        const target = groups
          .flatMap((group) => group.balances)
          .find((balance: BalanceItem) => balance.state === APIItemState.READY && balance.symbol.toUpperCase() === symbol.toUpperCase());
        if (!target) return false;
        const grow = (value?: string) => new FPNumber(value ?? '0').add(amount).toString();
        target.total = grow(target.total ?? target.free);
        target.free = grow(target.free);
        target.transferable = grow(target.transferable ?? target.free);
        accountsStore.setBalance({ details: groups });
        return true;
      },
    };
  }
}
