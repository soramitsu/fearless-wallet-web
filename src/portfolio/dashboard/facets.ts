import { FPNumber } from '@sora-substrate/util';
import type { PortfolioHolding } from '@extension-base/background/types/types';
import type { AllocationEntity, AllocationFacet, SlotMap } from '@/portfolio/dashboard/allocation';
import type { WalletPortfolio } from '@/portfolio/dashboard/aggregate';

/** A holding with the wallet that holds it. */
export interface HoldingRef {
  address: string;
  walletName: string;
  holding: PortfolioHolding;
}

export interface TokenGroupInfo {
  id: string;
  symbol: string;
  name: string;
}

/** The approved group of an asset key, if it has one (src/portfolio/tokenGroups.ts). Never built from symbols. */
export type GroupOf = (assetKey: string) => TokenGroupInfo | undefined;

export const holdingRefs = (wallets: readonly WalletPortfolio[]): HoldingRef[] =>
  wallets.flatMap(({ address, name, holdings }) => holdings.map((holding) => ({ address, walletName: name, holding })));

/** The token a holding belongs to: its approved group, otherwise the asset itself. */
export const tokenKeyOf = (holding: PortfolioHolding, groupOf: GroupOf): string => {
  const group = groupOf(holding.key);

  return group ? `group:${group.id}` : holding.key;
};

const tokenNameOf = (holding: PortfolioHolding, groupOf: GroupOf): string => groupOf(holding.key)?.symbol ?? holding.symbol;

/** The entities the fan draws for one facet; the same holdings feed every facet, so the totals agree. */
export function allocationEntities(facet: AllocationFacet, refs: readonly HoldingRef[], groupOf: GroupOf): AllocationEntity[] {
  const byKey = new Map<string, AllocationEntity>();

  refs.forEach(({ address, walletName, holding }) => {
    const [key, name] =
      facet === 'token'
        ? [tokenKeyOf(holding, groupOf), tokenNameOf(holding, groupOf)]
        : facet === 'network'
          ? [holding.networkName, holding.networkName]
          : [address, walletName];
    const entity = byKey.get(key) ?? { key, name, value: 0 };

    entity.value += Number(holding.fiat);
    byKey.set(key, entity);
  });

  return [...byKey.values()];
}

// The colours first launch gives the curated tokens (design spec 3.3), so the same token has the same colour on every
// device. Approved group ids come from the shared file; XOR is not in a group and is found on SORA. This only picks
// colours: it never merges or sums anything.
const SEEDED_GROUP_SLOTS: Readonly<Record<string, number>> = { 'group:eth': 2, 'group:btc': 3, 'group:dot': 4, 'group:usdt': 5 };

export function seedSlots(facet: AllocationFacet, refs: readonly HoldingRef[], groupOf: GroupOf): SlotMap {
  if (facet !== 'token') return {};

  const xor = refs.find(({ holding }) => holding.symbol.toUpperCase() === 'XOR' && holding.networkName.toUpperCase() === 'SORA');

  return { ...SEEDED_GROUP_SLOTS, ...(xor ? { [tokenKeyOf(xor.holding, groupOf)]: 1 } : {}) };
}

export interface AggregateTokenChild {
  address: string;
  walletName: string;
  networkName: string;
  symbol: string;
  amount: string;
  fiat: string;
  changePercent: string | null;
}

/** One Tokens-lens row of the all-wallets scope: a group's holdings summed over every network and wallet. */
export interface AggregateTokenRow {
  id: string;
  symbol: string;
  name: string;
  fiat: string;
  /** Amounts add up only within a group, whose members are one asset (portfolio contract §3). */
  amount: string;
  changePercent: string | null;
  networks: string[];
  wallets: string[];
  children: AggregateTokenChild[];
}

const byFiatDescending = (a: { fiat: string }, b: { fiat: string }): number => new FPNumber(b.fiat).sub(new FPNumber(a.fiat)).toNumber();

export function buildAggregateTokenRows(refs: readonly HoldingRef[], groupOf: GroupOf): AggregateTokenRow[] {
  const rows = new Map<string, AggregateTokenRow>();

  refs.forEach(({ address, walletName, holding }) => {
    const id = tokenKeyOf(holding, groupOf);
    const group = groupOf(holding.key);
    const row = rows.get(id) ?? {
      id,
      symbol: group?.symbol ?? holding.symbol,
      name: group?.name ?? holding.name,
      fiat: '0',
      amount: '0',
      changePercent: null,
      networks: [],
      wallets: [],
      children: [],
    };

    row.fiat = new FPNumber(row.fiat).add(new FPNumber(holding.fiat)).toString();
    row.amount = new FPNumber(row.amount).add(new FPNumber(holding.amount)).toString();
    row.children.push({
      address,
      walletName,
      networkName: holding.networkName,
      symbol: holding.symbol,
      amount: holding.amount,
      fiat: holding.fiat,
      changePercent: holding.changePercent,
    });
    if (!row.networks.includes(holding.networkName)) row.networks.push(holding.networkName);
    if (!row.wallets.includes(walletName)) row.wallets.push(walletName);
    rows.set(id, row);
  });

  return [...rows.values()]
    .map((row) => {
      const children = [...row.children].sort(byFiatDescending);

      // A group's members share one trusted price, so the largest member that has a change speaks for the row.
      return { ...row, children, changePercent: children.find((child) => child.changePercent !== null)?.changePercent ?? null };
    })
    .sort((a, b) => byFiatDescending(a, b) || a.symbol.localeCompare(b.symbol));
}

export interface AggregateNetworkRow {
  id: string;
  address: string;
  walletName: string;
  symbol: string;
  name: string;
  amount: string;
  fiat: string;
  changePercent: string | null;
}

/** One Networks-lens section of the all-wallets scope. */
export interface AggregateNetworkSection {
  name: string;
  fiat: string;
  rows: AggregateNetworkRow[];
}

export function buildAggregateNetworkSections(refs: readonly HoldingRef[]): AggregateNetworkSection[] {
  const sections = new Map<string, AggregateNetworkSection>();

  refs.forEach(({ address, walletName, holding }) => {
    const section = sections.get(holding.networkName) ?? { name: holding.networkName, fiat: '0', rows: [] };

    section.fiat = new FPNumber(section.fiat).add(new FPNumber(holding.fiat)).toString();
    section.rows.push({
      id: `${address}:${holding.key}`,
      address,
      walletName,
      symbol: holding.symbol,
      name: holding.name,
      amount: holding.amount,
      fiat: holding.fiat,
      changePercent: holding.changePercent,
    });
    sections.set(holding.networkName, section);
  });

  return [...sections.values()]
    .map((section) => ({ ...section, rows: [...section.rows].sort(byFiatDescending) }))
    .sort((a, b) => byFiatDescending(a, b) || a.name.localeCompare(b.name));
}
