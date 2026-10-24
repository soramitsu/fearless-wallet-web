import { FPNumber } from '@sora-substrate/util';
import type { PortfolioHolding } from '@extension-base/background/types/types';
import { tokenKeyOf, type GroupOf, type HoldingRef } from '@/portfolio/dashboard/facets';

/** One holding of the token, with the wallet that holds it. */
export interface LocationHolding {
  /** Unique per wallet and asset: the wallet's address and the portfolio asset key. */
  id: string;
  address: string;
  walletName: string;
  key: string;
  networkName: string;
  symbol: string;
  name: string;
  amount: string;
  transferable: string;
  /** What `amount` has that `transferable` does not: reserved, locked or staked. */
  held: string;
  fiat: string;
  changePercent: string | null;
  /** Percent of the token's value. */
  share: number;
}

/** The token on one network: what the orbit draws as a satellite. */
export interface LocationNetwork {
  name: string;
  amount: string;
  fiat: string;
  /** Percent of the token's value. */
  share: number;
  /** Largest first. */
  holdings: LocationHolding[];
}

export interface TokenLocations {
  /** The token's key: an approved group (`group:dot`) or the asset's own key. */
  key: string;
  symbol: string;
  name: string;
  amount: string;
  fiat: string;
  changePercent: string | null;
  /** Percent of everything counted in the scope. */
  portfolioShare: number;
  /** Largest first. */
  networks: LocationNetwork[];
  /** Largest first. */
  holdings: LocationHolding[];
}

const zero = FPNumber.ZERO;
const fp = (value: string): FPNumber => new FPNumber(value || '0');
const percentOf = (part: FPNumber, whole: FPNumber): number => (whole.isGtZero() ? part.div(whole).mul(FPNumber.HUNDRED).toNumber() : 0);
const byValue = (left: { fiat: string; name?: string }, right: { fiat: string; name?: string }): number =>
  fp(right.fiat).sub(fp(left.fiat)).toNumber() || (left.name ?? '').localeCompare(right.name ?? '');

function heldPart(holding: PortfolioHolding): string {
  const held = fp(holding.amount).sub(fp(holding.transferable));

  return held.isGtZero() ? held.toString() : '0';
}

/**
 * Where one token lives (design spec 4.4): its holdings in every wallet in scope, by network and by wallet, largest
 * first. The token is an approved group or a single asset, as in the Tokens lens, so two assets that merely share a
 * symbol never meet here. `portfolioTotal` is the scope's counted total, for the token's share of it.
 */
export function buildTokenLocations(
  tokenKey: string,
  refs: readonly HoldingRef[],
  groupOf: GroupOf,
  portfolioTotal: string
): TokenLocations | undefined {
  const members = refs.filter(({ holding }) => tokenKeyOf(holding, groupOf) === tokenKey);

  if (!members.length) return undefined;

  const total = members.reduce((sum, { holding }) => sum.add(fp(holding.fiat)), zero);
  const amount = members.reduce((sum, { holding }) => sum.add(fp(holding.amount)), zero);
  const holdings: LocationHolding[] = members
    .map(({ address, walletName, holding }) => ({
      id: `${address}|${holding.key}`,
      address,
      walletName,
      key: holding.key,
      networkName: holding.networkName,
      symbol: holding.symbol,
      name: holding.name,
      amount: holding.amount,
      transferable: holding.transferable,
      held: heldPart(holding),
      fiat: holding.fiat,
      changePercent: holding.changePercent,
      share: percentOf(fp(holding.fiat), total),
    }))
    .sort((left, right) => byValue(left, right) || left.networkName.localeCompare(right.networkName));

  const byNetwork = new Map<string, LocationHolding[]>();

  holdings.forEach((holding) => byNetwork.set(holding.networkName, [...(byNetwork.get(holding.networkName) ?? []), holding]));

  const networks: LocationNetwork[] = [...byNetwork.entries()]
    .map(([name, rows]) => {
      const fiat = rows.reduce((sum, row) => sum.add(fp(row.fiat)), zero);

      return {
        name,
        amount: rows.reduce((sum, row) => sum.add(fp(row.amount)), zero).toString(),
        fiat: fiat.toString(),
        share: percentOf(fiat, total),
        holdings: rows,
      };
    })
    .sort((left, right) => byValue(left, right) || left.name.localeCompare(right.name));

  const [first] = members.map(({ holding }) => holding);
  const group = groupOf(first.key);

  return {
    key: tokenKey,
    symbol: group?.symbol ?? first.symbol,
    name: group?.name ?? first.name,
    amount: amount.toString(),
    fiat: total.toString(),
    changePercent: holdings.find((holding) => holding.changePercent !== null)?.changePercent ?? null,
    portfolioShare: percentOf(total, fp(portfolioTotal)),
    networks,
    holdings,
  };
}
