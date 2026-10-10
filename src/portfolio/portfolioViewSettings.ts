/**
 * Per-wallet portfolio view state, stored in `account_portfolio-view-v1` as `{ [walletAddress]: settings }`.
 * It is a convenience preference: a missing, corrupt or partly unknown value reads as the defaults, and it never
 * holds key material or asset preferences. "Hide zero" lives here because it is a filter, not a per-asset hide.
 */
export type PortfolioLens = 'token' | 'network';
export type PortfolioSort = 'value' | 'custom';

export interface PortfolioViewSettings {
  lens: PortfolioLens;
  hideZero: boolean;
  showHidden: boolean;
  showTestnets: boolean;
  /** Unset until the user picks one; `resolvePortfolioSort` supplies the default. */
  sort?: PortfolioSort;
  collapsedSections: string[];
  expandedGroups: string[];
  zeroNetworksExpanded: boolean;
  /** The set of funded hidden assets the user chose to keep hidden, as `hiddenFundsSignature` wrote it. */
  hiddenFundsNoticeAck?: string;
}

/** "By token" is the default lens on every platform (portfolio contract §6). */
export const DEFAULT_PORTFOLIO_LENS: PortfolioLens = 'token';

export const defaultPortfolioViewSettings = (): PortfolioViewSettings => ({
  lens: DEFAULT_PORTFOLIO_LENS,
  hideZero: false,
  showHidden: false,
  showTestnets: false,
  collapsedSections: [],
  expandedGroups: [],
  zeroNetworksExpanded: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : undefined;

const flag = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

/** Reads one wallet's stored settings field by field; anything malformed falls back to its default. */
export function parsePortfolioViewSettings(value: unknown): PortfolioViewSettings {
  const defaults = defaultPortfolioViewSettings();
  if (!isRecord(value)) return defaults;

  return {
    lens: value.lens === 'token' || value.lens === 'network' ? value.lens : defaults.lens,
    hideZero: flag(value.hideZero) ?? defaults.hideZero,
    showHidden: flag(value.showHidden) ?? defaults.showHidden,
    showTestnets: flag(value.showTestnets) ?? defaults.showTestnets,
    ...(value.sort === 'value' || value.sort === 'custom' ? { sort: value.sort } : {}),
    collapsedSections: stringList(value.collapsedSections) ?? defaults.collapsedSections,
    expandedGroups: stringList(value.expandedGroups) ?? defaults.expandedGroups,
    zeroNetworksExpanded: flag(value.zeroNetworksExpanded) ?? defaults.zeroNetworksExpanded,
    ...(typeof value.hiddenFundsNoticeAck === 'string' ? { hiddenFundsNoticeAck: value.hiddenFundsNoticeAck } : {}),
  };
}

/** The 3.0.5 custom order is kept for wallets that had one (D7); everyone else sorts by value. */
export function resolvePortfolioSort(settings: Pick<PortfolioViewSettings, 'sort'>, hasLegacyOrder: boolean): PortfolioSort {
  return settings.sort ?? (hasLegacyOrder ? 'custom' : 'value');
}

/** Identifies one set of funded hidden assets, so "Keep hidden" silences the notice until that set changes. */
export function hiddenFundsSignature(keys: string[]): string {
  return [...new Set(keys)].sort().join('|');
}

export function toggleListEntry(list: string[], entry: string, present: boolean): string[] {
  const without = list.filter((item) => item !== entry);
  return present ? [...without, entry] : without;
}
