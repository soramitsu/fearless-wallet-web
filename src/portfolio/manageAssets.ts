import type { AssetPreference, PortfolioAsset, PortfolioNetworkSection } from '@/portfolio/assetIdentity';
import { FPNumber } from '@/sora/number';

/**
 * Manage assets: which assets the wallet's list shows, found and changed in one place.
 *
 * The list finds what the wallet holds by itself: a funded verified asset is always listed, without anyone switching
 * it on. A token with no balance is listed only because the owner added it ("Shown"), and a hidden one never is. Manage
 * puts every asset the wallet can hold in one of four places, each switch saying whether that asset is in the list:
 *
 * - `wallet`: in the list now, because it holds something or was added;
 * - `unverified`: held, but not on the verified list, so the list leaves it out until the owner shows it;
 * - `add`: a verified token with no balance that the owner can add;
 * - `hidden`: hidden by the owner (here or in 3.0.5), funded or not.
 */
export type ManageSection = 'wallet' | 'unverified' | 'add' | 'hidden';

export interface ManageListRules {
  /** Held tokens that are not on the verified list are listed too (`assetDiscoveryMode: 'visible'`). */
  surfaceDiscoveredAssets: boolean;
}

type ListedFields = Pick<PortfolioAsset, 'hidden' | 'trust' | 'hasBalance' | 'balanceUnavailable' | 'preference'>;

/**
 * Whether the wallet's list shows this asset: what it holds (a balance nobody could load included, which may be one),
 * and a token the owner added at zero. A hidden asset never is. Unverified tokens are listed when the owner showed
 * them, or when discovered tokens are surfaced.
 */
export function isInWalletList(asset: ListedFields, { surfaceDiscoveredAssets }: ManageListRules): boolean {
  if (asset.hidden) return false;
  if (asset.trust === 'verified') return asset.hasBalance || Boolean(asset.balanceUnavailable) || asset.preference === 'shown';

  return asset.hasBalance && (asset.preference === 'shown' || surfaceDiscoveredAssets);
}

/** Whether the list would show the asset with no choice stored: it would be found on its own. */
export function isListedAutomatically(asset: ListedFields, rules: ManageListRules): boolean {
  return isInWalletList({ ...asset, hidden: false, preference: 'auto' }, rules);
}

/**
 * The preference a switch writes: the lightest choice that puts the asset in the list or takes it out. A held asset
 * shown again goes back to automatic (it leaves the list once it holds nothing); a token with no balance is added as
 * Shown. Taking out a held asset hides it; taking out a token that was only added makes it automatic again, so a later
 * deposit still shows it.
 */
export function preferenceForSwitch(asset: ListedFields, show: boolean, rules: ManageListRules): AssetPreference {
  const automatic = isListedAutomatically(asset, rules);

  if (show) return automatic ? 'auto' : 'shown';
  return automatic ? 'hidden' : 'auto';
}

/** Where Manage puts an asset; `undefined` for one the list can never show (an unverified token with no balance). */
export function manageSectionOf(asset: PortfolioAsset, rules: ManageListRules): ManageSection | undefined {
  if (isInWalletList(asset, rules)) return 'wallet';
  if (asset.hidden) return 'hidden';
  if (asset.trust !== 'verified') return asset.hasBalance ? 'unverified' : undefined;

  return 'add';
}

export interface ManageAssetEntry {
  asset: PortfolioAsset;
  /** Where the asset belongs now. Manage keeps a row where it was while the page is open (`placeManageEntries`). */
  section: ManageSection;
  /** In the list now. */
  listed: boolean;
  /** In the list only because the owner added it: it holds nothing. */
  added: boolean;
  /** Suggested before anything is typed: the shared list of popular tokens, and the main token of a favourite network. */
  popular: boolean;
  networkRank: number;
}

export interface ManageEntriesInput {
  /** `buildPortfolioSections` in Manage mode: every verified asset, every holding and every asset with a choice. */
  sections: PortfolioNetworkSection[];
  rules: ManageListRules;
  isPopular?: (asset: PortfolioAsset) => boolean;
  networkRank?: (networkName: string) => number;
}

export function buildManageEntries({
  sections,
  rules,
  isPopular = () => false,
  networkRank = () => Number.POSITIVE_INFINITY,
}: ManageEntriesInput): ManageAssetEntry[] {
  const seen = new Set<string>();

  return sections
    .flatMap((section) => [...section.assets, ...section.detectedAssets])
    .flatMap((asset) => {
      const section = manageSectionOf(asset, rules);
      if (!section || seen.has(asset.key)) return [];

      seen.add(asset.key);
      const listed = section === 'wallet';

      return [
        {
          asset,
          section,
          listed,
          added: listed && !asset.hasBalance && !asset.balanceUnavailable,
          popular: asset.trust === 'verified' && isPopular(asset),
          networkRank: networkRank(asset.networkName),
        },
      ];
    });
}

const isHeld = ({ asset }: ManageAssetEntry): boolean => asset.hasBalance || Boolean(asset.balanceUnavailable);

const byName = (left: ManageAssetEntry, right: ManageAssetEntry): number =>
  left.asset.symbol.localeCompare(right.asset.symbol) ||
  left.networkRank - right.networkRank ||
  left.asset.networkName.localeCompare(right.asset.networkName) ||
  left.asset.key.localeCompare(right.asset.key);

/** Held first, the most valuable first; then by name. Two unranked networks compare as NaN and fall to the name. */
export function compareByHolding(left: ManageAssetEntry, right: ManageAssetEntry): number {
  if (isHeld(left) !== isHeld(right)) return isHeld(left) ? -1 : 1;

  const leftPriced = left.asset.fiatValue !== null && left.asset.hasBalance;
  const rightPriced = right.asset.fiatValue !== null && right.asset.hasBalance;
  if (leftPriced !== rightPriced) return leftPriced ? -1 : 1;
  if (leftPriced && rightPriced) {
    const leftValue = new FPNumber(left.asset.fiatValue!);
    const rightValue = new FPNumber(right.asset.fiatValue!);
    if (!leftValue.eq(rightValue)) return rightValue.gt(leftValue) ? 1 : -1;
  }

  return byName(left, right);
}

/** Popular suggestions: the most used networks first, then by name. */
export function compareSuggestions(left: ManageAssetEntry, right: ManageAssetEntry): number {
  return left.networkRank - right.networkRank || byName(left, right);
}

const words = (value: string): string[] => value.toLowerCase().split(/[\s\-_.()/]+/u).filter(Boolean);

/** How well one typed word names the asset: 0 is its exact symbol; `undefined` when it names nothing about it. */
function termRank(asset: PortfolioAsset, term: string): number | undefined {
  const symbol = asset.symbol.toLowerCase();

  if (symbol === term) return 0;
  if (symbol.startsWith(term)) return 1;
  if (words(asset.name).some((word) => word.startsWith(term))) return 2;
  if (`${symbol} ${asset.name.toLowerCase()}`.includes(term)) return 3;
  // A network is named from the start of a word, so "dot" finds DOT but not every token on Polkadot Asset Hub.
  if (words(asset.networkName).some((word) => word.startsWith(term))) return 4;
  return undefined;
}

/**
 * How well a search names the asset, best first, or `undefined` when it does not. Every word must name the token or
 * its network, so "usdc arb" finds USDC on Arbitrum One.
 */
export function manageSearchRank(asset: PortfolioAsset, query: string): number | undefined {
  // Split on spaces only, so "usdc.e" stays one word and finds USDC.E by its symbol.
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return 0;

  let total = 0;
  for (const term of terms) {
    const rank = termRank(asset, term);
    if (rank === undefined) return undefined;
    total += rank;
  }

  return total;
}

/** Search results to add: the closest names first, popular tokens and networks next. */
export function compareSearchResults(query: string) {
  return (left: ManageAssetEntry, right: ManageAssetEntry): number =>
    (manageSearchRank(left.asset, query) ?? Number.POSITIVE_INFINITY) -
      (manageSearchRank(right.asset, query) ?? Number.POSITIVE_INFINITY) ||
    Number(right.popular) - Number(left.popular) ||
    Number(right.asset.isNative || right.asset.isUtility) - Number(left.asset.isNative || left.asset.isUtility) ||
    compareSuggestions(left, right);
}

/** At most this many tokens to add are listed for a search; typing more narrows them. */
export const MANAGE_SEARCH_LIMIT = 50;

export interface ManageView {
  wallet: ManageAssetEntry[];
  unverified: ManageAssetEntry[];
  add: ManageAssetEntry[];
  hidden: ManageAssetEntry[];
  /** Tokens that could be added under any search: what "search to add any of N tokens" counts. */
  addableCount: number;
  /** Search results to add that the limit left out. */
  moreToAdd: number;
}

/**
 * The page's four lists. A row stays where `placement` put it (where it was when the page opened or the search
 * changed), so switching it never moves it away from under the pointer; a row that arrives later goes where it belongs.
 * Without a search, Add lists only the popular suggestions; with one, every token that matches.
 */
export function buildManageView(
  entries: ManageAssetEntry[],
  { query = '', placement }: { query?: string; placement?: ReadonlyMap<string, ManageSection> } = {}
): ManageView {
  const search = query.trim().toLowerCase();
  const sectionOf = (entry: ManageAssetEntry): ManageSection => placement?.get(entry.asset.key) ?? entry.section;
  const matches = (entry: ManageAssetEntry): boolean => !search || manageSearchRank(entry.asset, search) !== undefined;
  const inSection = (section: ManageSection) => entries.filter((entry) => sectionOf(entry) === section);

  const addable = inSection('add');
  const add = search
    ? addable.filter(matches).sort(compareSearchResults(search))
    : addable.filter(({ popular }) => popular).sort(compareSuggestions);

  return {
    wallet: inSection('wallet').filter(matches).sort(compareByHolding),
    unverified: inSection('unverified').filter(matches).sort(byName),
    add: add.slice(0, MANAGE_SEARCH_LIMIT),
    hidden: inSection('hidden').filter(matches).sort(compareByHolding),
    addableCount: addable.length,
    moreToAdd: Math.max(0, add.length - MANAGE_SEARCH_LIMIT),
  };
}

/** Where each row is now: kept by the page while it is open, so rows do not jump when they are switched. */
export function placeManageEntries(entries: ManageAssetEntry[]): Map<string, ManageSection> {
  return new Map(entries.map(({ asset, section }) => [asset.key, section]));
}
