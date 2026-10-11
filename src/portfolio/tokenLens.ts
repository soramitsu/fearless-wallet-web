import { FPNumber } from '@sora-substrate/util';
import type { NetworkJson } from '@extension-base/types';
import type { PortfolioAsset, PortfolioNetworkSection } from '@/portfolio/assetIdentity';
import type { CanonicalMemberRole } from '@/portfolio/canonicalGroups';
import type { PortfolioSort } from '@/portfolio/portfolioViewSettings';
import type { CanonicalGroup, CanonicalGroupIndex } from '@/portfolio/tokenGroups';

/** One network of a token row: the portfolio asset on that network, with its role when it is a group member. */
export interface PortfolioTokenChild {
  asset: PortfolioAsset;
  role?: CanonicalMemberRole;
  networkRank: number;
}

/**
 * One row of the By token lens: an approved group with at least two members on screen, or a single asset on its
 * network. Amounts add up only within a group, whose members are one asset; fiat is the sum of each member's own
 * fiat, so a group never lends a price to a member that has none (portfolio contract §3).
 */
export interface PortfolioTokenRow {
  /** `group:<id>` for a combined row, the asset key for a single one. */
  id: string;
  groupId?: string;
  symbol: string;
  name: string;
  icon: string;
  /** The network of the largest holding, shown as the badge on the token icon. */
  networkIcon: string;
  /** Networks with a balance (or shown at zero), sorted by value. */
  children: PortfolioTokenChild[];
  /** Networks shown at zero, collapsed under the funded ones. */
  zeroChildren: PortfolioTokenChild[];
  networkCount: number;
  /** Total balance of the members that are not hidden (of every member when all of them are hidden). */
  balanceText: string;
  transferableText: string;
  hasBalance: boolean;
  /** Sum of the counted members' fiat; null when no funded member has a price. */
  fiatValue: string | null;
  /** Funded members without a trusted price, which add nothing to `fiatValue`. */
  unpricedNetworkCount: number;
  /**
   * Counted members whose balance no provider could load. They add nothing to the amount, which is then a part of
   * what the row holds, and they keep the row out of the "no balance" block: an unknown balance is not a zero.
   */
  unavailableNetworkCount?: number;
  /** No counted member's balance could be loaded: the row says so instead of an amount. */
  balanceUnavailable?: boolean;
  /** A counted member's last update failed; its amount, if any, is the last one confirmed. */
  balanceFailed?: boolean;
  /** Every member is hidden. */
  hidden: boolean;
  isTestnet: boolean;
}

export interface TokenRowsInput {
  sections: PortfolioNetworkSection[];
  index: CanonicalGroupIndex;
  networkRank?: (networkName: string) => number;
  sort?: PortfolioSort;
  /** The 3.0.5 custom order as `asset key → index` (`resolveLegacy305Order`). */
  legacyOrderIndex?: Map<string, number>;
}

const ZERO = FPNumber.ZERO;
const amountOf = (value: string | null | undefined): FPNumber => new FPNumber(value ?? '0');
const sum = (values: (string | null)[]): string =>
  values.reduce((total, value) => total.add(amountOf(value)), ZERO).toString();

/** Whether a member's fiat counts towards the row: priced, funded, verified and not on a testnet. */
const isPriced = ({ asset }: PortfolioTokenChild): boolean =>
  !asset.isTestnet && asset.trust === 'verified' && asset.hasBalance && asset.fiatValue !== null;

const compareChildren = (left: PortfolioTokenChild, right: PortfolioTokenChild): number => {
  const leftFiat = amountOf(left.asset.fiatValue ?? '-1');
  const rightFiat = amountOf(right.asset.fiatValue ?? '-1');
  if (!leftFiat.eq(rightFiat)) return rightFiat.gt(leftFiat) ? 1 : -1;

  const leftAmount = amountOf(left.asset.balanceText);
  const rightAmount = amountOf(right.asset.balanceText);
  if (!leftAmount.eq(rightAmount)) return rightAmount.gt(leftAmount) ? 1 : -1;

  return left.networkRank - right.networkRank || left.asset.networkName.localeCompare(right.asset.networkName);
};

/** A row with a balance, or with a balance nobody could load, which may be one: it never goes under "no balance". */
const isFundedRow = (row: PortfolioTokenRow): boolean => row.hasBalance || Boolean(row.unavailableNetworkCount);

function toRow(id: string, members: PortfolioTokenChild[], group?: { id: string; symbol: string; name: string }): PortfolioTokenRow {
  const sorted = [...members].sort(compareChildren);
  const children = sorted.filter(({ asset }) => asset.hasBalance || asset.balanceUnavailable || members.length === 1);
  const zeroChildren = sorted.filter((child) => !children.includes(child));
  const hidden = members.every(({ asset }) => asset.hidden);
  // A partly hidden group adds up what is not hidden, as the header does; a fully hidden one (listed in Manage or
  // under Show hidden) still shows what it holds, dimmed, and is counted nowhere.
  const summed = hidden ? members : members.filter(({ asset }) => !asset.hidden);
  const priced = summed.filter(isPriced);
  const unpricedNetworkCount = summed.filter(
    ({ asset }) => asset.hasBalance && asset.trust === 'verified' && asset.fiatValue === null
  ).length;
  const unavailableNetworkCount = summed.filter(({ asset }) => asset.balanceUnavailable).length;
  const [lead] = sorted;

  return {
    id,
    groupId: group?.id,
    symbol: group?.symbol ?? lead.asset.symbol,
    name: group?.name ?? lead.asset.name,
    icon: lead.asset.icon,
    networkIcon: lead.asset.networkIcon,
    children,
    zeroChildren,
    networkCount: members.length,
    balanceText: sum(summed.map(({ asset }) => asset.balanceText)),
    transferableText: sum(summed.map(({ asset }) => asset.transferableText)),
    // Like a network section: a hidden holding shown with its chip still makes the row a funded one.
    hasBalance: members.some(({ asset }) => asset.hasBalance),
    fiatValue: priced.length ? sum(priced.map(({ asset }) => asset.fiatValue)) : null,
    unpricedNetworkCount,
    unavailableNetworkCount,
    balanceUnavailable: unavailableNetworkCount === summed.length,
    balanceFailed: summed.some(({ asset }) => asset.balanceFailed),
    hidden,
    isTestnet: members.every(({ asset }) => asset.isTestnet),
  };
}

const compareByValue = (left: PortfolioTokenRow, right: PortfolioTokenRow): number => {
  if (isFundedRow(left) !== isFundedRow(right)) return isFundedRow(left) ? -1 : 1;

  const leftPriced = left.fiatValue !== null;
  const rightPriced = right.fiatValue !== null;
  if (leftPriced !== rightPriced) return leftPriced ? -1 : 1;
  if (leftPriced && rightPriced) {
    const leftFiat = amountOf(left.fiatValue);
    const rightFiat = amountOf(right.fiatValue);
    if (!leftFiat.eq(rightFiat)) return rightFiat.gt(leftFiat) ? 1 : -1;
  }

  return left.symbol.localeCompare(right.symbol) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
};

/**
 * The By token rows of the displayed assets (portfolio contract §6). The input is what the By network lens would
 * show (`buildPortfolioSections` in the same mode, after the Hidden filter and the search), so visibility, the zero
 * rule, Hide zero and the wallet scope are decided once for both lenses. Members of an approved group become one row
 * when at least two of them are on screen; every other asset is its own row, labelled with its network. Detected
 * (unverified) assets are never grouped and stay with their network.
 */
export function buildTokenRows({
  sections,
  index,
  networkRank = () => Number.POSITIVE_INFINITY,
  sort = 'value',
  legacyOrderIndex = new Map(),
}: TokenRowsInput): PortfolioTokenRow[] {
  const grouped = new Map<string, PortfolioTokenChild[]>();
  const singles: PortfolioTokenChild[] = [];

  sections.forEach((section) =>
    section.assets.forEach((asset) => {
      const member = asset.trust === 'verified' ? index.memberOfKey.get(asset.key) : undefined;
      const child: PortfolioTokenChild = { asset, role: member?.role, networkRank: networkRank(asset.networkName) };

      if (member && index.groups.has(member.groupId)) {
        grouped.set(member.groupId, [...(grouped.get(member.groupId) ?? []), child]);
      } else {
        singles.push(child);
      }
    })
  );

  const rows: PortfolioTokenRow[] = [];
  grouped.forEach((members, groupId) => {
    if (members.length > 1) rows.push(toRow(`group:${groupId}`, members, index.groups.get(groupId)));
    else singles.push(...members);
  });
  singles.forEach((child) => rows.push(toRow(child.asset.key, [child])));

  const byValue = [...rows].sort(compareByValue);
  if (sort !== 'custom' || legacyOrderIndex.size === 0) return byValue;

  // The 3.0.5 order: a row takes the first position of any of its networks; rows 3.0.5 never ordered follow by value.
  const position = (row: PortfolioTokenRow): number =>
    Math.min(
      ...[...row.children, ...row.zeroChildren].map(({ asset }) => legacyOrderIndex.get(asset.key) ?? Number.POSITIVE_INFINITY)
    );

  return byValue
    .map((row, valueOrder) => ({ row, valueOrder, position: position(row) }))
    .sort((left, right) => {
      if (isFundedRow(left.row) !== isFundedRow(right.row)) return isFundedRow(left.row) ? -1 : 1;
      if (left.position !== right.position) return left.position - right.position;
      return left.valueOrder - right.valueOrder;
    })
    .map(({ row }) => row);
}

/**
 * Rows with a balance first; rows that only hold zero go into the collapsed "N tokens · no balance" block. A row
 * whose balance could not be loaded stays with the funded ones, saying so, as its network does in the By network lens.
 */
export function splitZeroTokenRows(rows: PortfolioTokenRow[]): { funded: PortfolioTokenRow[]; zeroOnly: PortfolioTokenRow[] } {
  return {
    funded: rows.filter(isFundedRow),
    zeroOnly: rows.filter((row) => !isFundedRow(row)),
  };
}

/** Every asset key of a row: what a group switch in Manage writes. */
export function tokenRowKeys(row: PortfolioTokenRow): string[] {
  return [...row.children, ...row.zeroChildren].map(({ asset }) => asset.key);
}

/** One network the user can pick for a Send or a Receive from a token row. */
export interface GroupNetworkOption {
  key: string;
  assetId: string;
  networkName: string;
  networkIcon: string;
  role?: CanonicalMemberRole;
  /** What can be sent (Send) or what the wallet holds there (Receive); absent when nothing is loaded. */
  amountText?: string;
  /** No provider could load the balance on this network: the picker says so instead of showing a zero. */
  balanceUnavailable?: boolean;
}

const optionOf = ({ asset, role }: PortfolioTokenChild, amountText: string): GroupNetworkOption => ({
  key: asset.key,
  assetId: asset.assetId,
  networkName: asset.networkName,
  networkIcon: asset.networkIcon,
  role,
  ...(asset.balanceUnavailable ? { balanceUnavailable: true } : { amountText }),
});

/**
 * The networks a Send from a token row offers: the funded networks the row shows, not hidden, where this build can
 * send now. Nothing is preselected; the confirm screen names the network again (portfolio contract §7).
 */
export function groupSendOptions(row: PortfolioTokenRow, canSendOn: (networkName: string) => boolean): GroupNetworkOption[] {
  return row.children
    .filter(({ asset }) => asset.hasBalance && !asset.hidden && canSendOn(asset.networkName))
    .map((child) => optionOf(child, child.asset.transferableText));
}

/**
 * The networks a Receive from a token row offers: every member of the approved group on a network the wallet holds
 * an account for, whether or not it holds anything there yet, in the order the row lists them, then by rank.
 */
export function groupReceiveOptions({
  row,
  group,
  networks,
  inScope,
}: {
  row: PortfolioTokenRow;
  group: CanonicalGroup | undefined;
  networks: NetworkJson[];
  inScope: (network: NetworkJson) => boolean;
}): GroupNetworkOption[] {
  const shown = [...row.children, ...row.zeroChildren];
  const options = shown.map((child) => optionOf(child, child.asset.balanceText));
  const listed = new Set(options.map(({ key }) => key));
  const networksByName = new Map(networks.map((network) => [network.name, network]));

  const others = (group?.members ?? [])
    .filter(({ key }) => !listed.has(key))
    .flatMap((member) => {
      const network = networksByName.get(member.networkName);
      if (!network || !inScope(network)) return [];

      return [{ member, network, rank: network.rank ?? Number.POSITIVE_INFINITY }];
    })
    .sort((left, right) => left.rank - right.rank || left.network.name.localeCompare(right.network.name))
    .map(({ member, network }) => ({
      key: member.key,
      assetId: member.assetId,
      networkName: network.name,
      networkIcon: network.icon,
      role: member.role,
    }));

  return [...options, ...others];
}
