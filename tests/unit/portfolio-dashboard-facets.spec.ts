import type { PortfolioHolding } from '@extension-base/background/types/types';
import type { WalletPortfolio } from '@/portfolio/dashboard/aggregate';
import {
  allocationEntities,
  buildAggregateNetworkSections,
  buildAggregateTokenRows,
  holdingRefs,
  seedSlots,
  tokenKeyOf,
  type GroupOf,
} from '@/portfolio/dashboard/facets';
import { buildAllocation } from '@/portfolio/dashboard/allocation';

const holding = (key: string, symbol: string, networkName: string, amount: string, fiat: string, changePercent: string | null = null): PortfolioHolding => ({
  key,
  symbol,
  name: symbol,
  networkName,
  amount,
  transferable: amount,
  fiat,
  changePercent,
});

const wallet = (name: string, holdings: PortfolioHolding[]): WalletPortfolio => ({
  address: `addr-${name}`,
  name,
  total: '0',
  changeAmount: '0',
  changePercent: '0',
  hiddenCount: 0,
  unpricedCount: 0,
  unavailableCount: 0,
  poolStakesExcluded: false,
  holdings,
  staleNetworks: [],
});

const DOT_RELAY = holding('substrate:polkadot:0', 'DOT', 'Polkadot', '10', '50', '2.5');
const DOT_HUB = holding('substrate:assethub:0', 'DOT', 'Asset Hub', '4', '20', '2.5');
const ETH = holding('evm:1:native', 'ETH', 'Ethereum', '1', '2000', '-1.2');
const XOR_A = holding('substrate:sora:xor', 'XOR', 'SORA', '1000', '30');
const WALLETS = [wallet('Main', [DOT_RELAY, ETH]), wallet('Savings', [DOT_HUB, DOT_RELAY, XOR_A])];

// DOT on the relay chain and on Asset Hub are one approved group; nothing else is grouped.
const groupOf: GroupOf = (key) =>
  key === DOT_RELAY.key || key === DOT_HUB.key ? { id: 'dot', symbol: 'DOT', name: 'Polkadot' } : undefined;
const noGroups: GroupOf = () => undefined;

describe('holdingRefs', () => {
  it('flattens every wallet and keeps the wallet each holding came from', () => {
    const refs = holdingRefs(WALLETS);

    expect(refs).toHaveLength(5);
    expect(refs.filter(({ walletName }) => walletName === 'Savings')).toHaveLength(3);
    expect(refs[0]).toMatchObject({ address: 'addr-Main', walletName: 'Main', holding: DOT_RELAY });
  });
});

describe('tokenKeyOf', () => {
  it('uses the approved group when there is one, and the asset itself otherwise', () => {
    expect(tokenKeyOf(DOT_RELAY, groupOf)).toBe('group:dot');
    expect(tokenKeyOf(DOT_HUB, groupOf)).toBe('group:dot');
    expect(tokenKeyOf(ETH, groupOf)).toBe(ETH.key);
  });

  it('never merges two assets that merely share a symbol', () => {
    const lookalike = holding('evm:56:0xabc', 'DOT', 'BNB Chain', '1', '5');

    expect(tokenKeyOf(lookalike, groupOf)).toBe(lookalike.key);
    expect(tokenKeyOf(lookalike, groupOf)).not.toBe(tokenKeyOf(DOT_RELAY, groupOf));
  });
});

describe('buildAggregateTokenRows', () => {
  it('sums a group over its networks and wallets, and lists where it lives, largest first', () => {
    const [dot] = buildAggregateTokenRows(holdingRefs(WALLETS), groupOf).filter(({ id }) => id === 'group:dot');

    expect(dot).toMatchObject({ symbol: 'DOT', name: 'Polkadot', amount: '24', fiat: '120', changePercent: '2.5' });
    expect(dot.networks.sort()).toEqual(['Asset Hub', 'Polkadot']);
    expect(dot.wallets.sort()).toEqual(['Main', 'Savings']);
    expect(dot.children.map(({ fiat }) => fiat)).toEqual(['50', '50', '20']);
  });

  it('orders rows by value and falls back to the symbol on a tie', () => {
    const rows = buildAggregateTokenRows(holdingRefs(WALLETS), groupOf);

    expect(rows.map(({ symbol }) => symbol)).toEqual(['ETH', 'DOT', 'XOR']);
    const tied = buildAggregateTokenRows(
      holdingRefs([wallet('A', [holding('k:z', 'ZED', 'N', '1', '10'), holding('k:a', 'ALF', 'N', '1', '10')])]),
      noGroups
    );
    expect(tied.map(({ symbol }) => symbol)).toEqual(['ALF', 'ZED']);
  });

  it('keeps the same asset in two wallets as one row with two children', () => {
    const rows = buildAggregateTokenRows(holdingRefs([wallet('A', [ETH]), wallet('B', [ETH])]), noGroups);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: '2', fiat: '4000', wallets: ['A', 'B'] });
    expect(rows[0].children).toHaveLength(2);
  });

  it('has no change when no member has a trusted change, and a row per ungrouped asset', () => {
    const rows = buildAggregateTokenRows(holdingRefs(WALLETS), noGroups);
    const xor = rows.find(({ symbol }) => symbol === 'XOR');

    expect(xor?.changePercent).toBeNull();
    expect(rows.filter(({ symbol }) => symbol === 'DOT')).toHaveLength(2);
  });

  it('is empty without holdings', () => {
    expect(buildAggregateTokenRows([], groupOf)).toEqual([]);
  });
});

describe('buildAggregateNetworkSections', () => {
  it('groups holdings by network with their wallet, largest section and row first', () => {
    const sections = buildAggregateNetworkSections(holdingRefs(WALLETS));

    expect(sections.map(({ name, fiat }) => [name, fiat])).toEqual([
      ['Ethereum', '2000'],
      ['Polkadot', '100'],
      ['SORA', '30'],
      ['Asset Hub', '20'],
    ]);
    expect(sections[1].rows.map(({ walletName }) => walletName)).toEqual(['Main', 'Savings']);
  });

  it('gives each row an id that is unique per wallet and asset', () => {
    const ids = buildAggregateNetworkSections(holdingRefs(WALLETS)).flatMap(({ rows }) => rows.map(({ id }) => id));

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('allocationEntities', () => {
  const total = (facet: Parameters<typeof allocationEntities>[0], groups: GroupOf = groupOf) =>
    allocationEntities(facet, holdingRefs(WALLETS), groups).reduce((acc, { value }) => acc + value, 0);

  it('adds up to the same value for every facet, so the lenses agree on the total', () => {
    // DOT 50 (Main) + ETH 2000 + DOT 20 (Savings, Asset Hub) + DOT 50 (Savings) + XOR 30.
    expect(total('token')).toBe(2150);
    expect(total('network')).toBe(total('token'));
    expect(total('wallet')).toBe(total('token'));
  });

  it('merges a group under its symbol for the token facet, and shows the network and wallet names for the others', () => {
    const tokens = allocationEntities('token', holdingRefs(WALLETS), groupOf);
    const dot = tokens.find(({ key }) => key === 'group:dot');

    expect(dot).toEqual({ key: 'group:dot', name: 'DOT', value: 120 });
    expect(allocationEntities('network', holdingRefs(WALLETS), groupOf).map(({ name }) => name).sort()).toEqual(['Asset Hub', 'Ethereum', 'Polkadot', 'SORA']);
    expect(allocationEntities('wallet', holdingRefs(WALLETS), groupOf).map(({ name }) => name).sort()).toEqual(['Main', 'Savings']);
  });
});

describe('seedSlots', () => {
  const sora = holding('substrate:sora:xor', 'XOR', 'SORA', '10', '300');
  const refs = holdingRefs([wallet('Main', [sora, DOT_RELAY, ETH])]);
  const groups: GroupOf = (key) => (key === DOT_RELAY.key ? { id: 'dot', symbol: 'DOT', name: 'Polkadot' } : key === ETH.key ? { id: 'eth', symbol: 'ETH', name: 'Ether' } : undefined);

  it('gives the curated tokens the colours the design table names, XOR first', () => {
    expect(seedSlots('token', refs, groups)).toMatchObject({ [sora.key]: 1, 'group:eth': 2, 'group:btc': 3, 'group:dot': 4, 'group:usdt': 5 });
  });

  it('seeds nothing for networks or wallets, and nothing for XOR when SORA holds none', () => {
    expect(seedSlots('network', refs, groups)).toEqual({});
    expect(seedSlots('wallet', refs, groups)).toEqual({});
    expect(seedSlots('token', holdingRefs([wallet('Main', [ETH])]), groups)['substrate:sora:xor']).toBeUndefined();
  });

  it('makes first launch the same on every device, whatever the amounts', () => {
    const entities = allocationEntities('token', refs, groups);
    const { groups: fan } = buildAllocation(entities, seedSlots('token', refs, groups));
    const slotOf = (key: string) => fan.find((group) => group.key === key)?.slot;

    expect(slotOf(sora.key)).toBe(1);
    expect(slotOf('group:eth')).toBe(2);
    expect(slotOf('group:dot')).toBe(4);
  });
});
