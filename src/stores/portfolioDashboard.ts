import { defineStore } from 'pinia';
import type { ResponsePortfolioHoldings } from '@extension-base/background/types/types';
import type { SlotMap } from '@/portfolio/dashboard/allocation';
import { getPortfolioHoldings } from '@/extension/messaging';
import { LocalStorage } from '@/controllers/localStorageController';
import {
  readPreferences,
  withSlots,
  writePreferences,
  type AllWalletsLens,
  type DashboardPreferences,
  type DashboardScope,
} from '@/portfolio/dashboard/preferences';

// Made on first use, so importing this module does nothing: a build without the dashboard can drop it.
let storage: LocalStorage | undefined;
const preferencesStorage = (): LocalStorage => (storage ??= new LocalStorage('portfolio_'));

// Reads can overlap (the poll, the wallet picker, a manual refresh); only the newest one may set the answer.
let latestRead = 0;

export type DashboardReadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The portfolio dashboard's state: the scope and lens the person chose, the chart slots they keep, and the last
 * read of every wallet's holdings. It reads and remembers; it never writes a balance or signs anything.
 */
export const usePortfolioDashboardStore = /* @__PURE__ */ defineStore('portfolioDashboard', {
  state: () => ({
    preferences: readPreferences(preferencesStorage()) as DashboardPreferences,
    /** The background's answer for every wallet; the selected wallet is also computed locally, so it is always fresh. */
    holdings: [] as ResponsePortfolioHoldings[],
    /** When `holdings` was last read, in milliseconds; 0 before the first answer. */
    readAt: 0,
    status: 'idle' as DashboardReadStatus,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  }),
  actions: {
    remember(preferences: DashboardPreferences) {
      this.preferences = preferences;
      writePreferences(preferencesStorage(), preferences);
    },
    setScope(scope: DashboardScope) {
      if (this.preferences.scope !== scope) this.remember({ ...this.preferences, scope });
    },
    setLens(lens: AllWalletsLens) {
      if (this.preferences.lens !== lens) this.remember({ ...this.preferences, lens });
    },
    setSlots(key: string, slots: SlotMap) {
      const next = withSlots(this.preferences, key, slots);

      if (next !== this.preferences) this.remember(next);
    },
    setOnline(online: boolean) {
      this.online = online;
    },
    /** Reads every wallet's counted holdings. A failed read keeps the last answer, which then shows as saved. */
    async refresh(hiddenKeysByAddress: Record<string, string[]> = {}) {
      const read = (latestRead += 1);

      this.status = 'loading';

      try {
        const holdings = await getPortfolioHoldings(Object.keys(hiddenKeysByAddress).length ? { hiddenKeysByAddress } : null);

        if (read !== latestRead) return;
        // Anything but a list is not an answer: the last one stays, and shows as saved.
        if (!Array.isArray(holdings)) throw new Error('portfolio holdings answer is not a list');

        this.holdings = holdings;
        this.readAt = Date.now();
        this.status = 'ready';
      } catch {
        if (read === latestRead) this.status = 'error';
      }
    },
  },
});
