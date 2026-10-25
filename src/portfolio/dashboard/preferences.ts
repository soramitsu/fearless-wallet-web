import { CHART_SLOT_COUNT, type SlotMap } from '@/portfolio/dashboard/allocation';

/** `all` reads every wallet; `wallet` reads the selected one. The last choice sticks per device. */
export type DashboardScope = 'all' | 'wallet';
export type AllWalletsLens = 'token' | 'network' | 'wallet';

export interface DashboardPreferences {
  scope: DashboardScope;
  /** The lens of the All wallets scope; one wallet keeps the lens its own portfolio view already remembers. */
  lens: AllWalletsLens;
  /** Chart slots per scope and lens, so an entity keeps its colour from one visit to the next. */
  slots: Record<string, SlotMap>;
}

/** The part of `LocalStorage` (src/controllers/localStorageController.ts) the dashboard needs. */
export interface PreferencesStorage {
  get: (key: string) => { value?: unknown };
  set: (key: string, value: Record<string, unknown>) => void;
}

export const DASHBOARD_PREFERENCES_KEY = 'dashboard-v1';

/** One slot map per wallet and lens would otherwise grow with every wallet ever opened. */
export const MAX_SLOT_MAPS = 40;

/** All wallets only exists with two or more wallets; one wallet always reads as itself. */
export const effectiveScope = (preferred: DashboardScope, walletCount: number): DashboardScope =>
  walletCount >= 2 ? preferred : 'wallet';

export const defaultPreferences = (): DashboardPreferences => ({ scope: 'all', lens: 'token', slots: {} });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSlot = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= CHART_SLOT_COUNT;

function sanitizeSlotMap(value: unknown): SlotMap | undefined {
  if (!isRecord(value)) return undefined;

  const used = new Set<number>();
  const map: SlotMap = {};

  Object.entries(value).forEach(([key, slot]) => {
    if (isSlot(slot) && !used.has(slot)) {
      used.add(slot);
      map[key] = slot;
    }
  });

  return Object.keys(map).length ? map : undefined;
}

/** Whatever is stored, the dashboard gets a usable value: an unknown shape or a bad field falls back to its default. */
export function sanitizePreferences(value: unknown): DashboardPreferences {
  const preferences = defaultPreferences();

  if (!isRecord(value)) return preferences;
  if (value.scope === 'all' || value.scope === 'wallet') preferences.scope = value.scope;
  if (value.lens === 'token' || value.lens === 'network' || value.lens === 'wallet') preferences.lens = value.lens;
  if (isRecord(value.slots)) {
    Object.entries(value.slots)
      .slice(-MAX_SLOT_MAPS)
      .forEach(([key, map]) => {
        const slots = sanitizeSlotMap(map);

        if (slots) preferences.slots[key] = slots;
      });
  }

  return preferences;
}

export function readPreferences(storage: PreferencesStorage): DashboardPreferences {
  try {
    return sanitizePreferences(storage.get(DASHBOARD_PREFERENCES_KEY).value);
  } catch {
    // A private window, blocked site data or a broken value: the dashboard starts from its defaults.
    return defaultPreferences();
  }
}

export function writePreferences(storage: PreferencesStorage, preferences: DashboardPreferences): void {
  try {
    storage.set(DASHBOARD_PREFERENCES_KEY, preferences as unknown as Record<string, unknown>);
  } catch {
    // The choice still applies for this visit; it is only not remembered.
  }
}

/** The key of the slot map for a scope and lens; one wallet keeps its own colours. */
export const slotMapKey = (scope: DashboardScope, lens: string, address: string): string =>
  scope === 'all' ? `all:${lens}` : `wallet:${address}:${lens}`;

/** Sets one slot map and drops the oldest ones past the cap. A map that is already stored is not rewritten. */
export function withSlots(preferences: DashboardPreferences, key: string, slots: SlotMap): DashboardPreferences {
  const current = preferences.slots[key];

  if (current && JSON.stringify(current) === JSON.stringify(slots)) return preferences;

  const { [key]: _replaced, ...others } = preferences.slots;
  const entries = Object.entries({ ...others, [key]: slots }).slice(-MAX_SLOT_MAPS);

  return { ...preferences, slots: Object.fromEntries(entries) };
}
