import type { PortfolioHolding } from '@extension-base/background/types/types';
import type { WalletPortfolio } from '@/portfolio/dashboard/aggregate';
import { holdingRefs, type GroupOf } from '@/portfolio/dashboard/facets';
import { buildTokenLocations } from '@/portfolio/dashboard/locations';

const holding = (key: string, symbol: string, networkName: string, amount: string, fiat: string, extra: Partial<PortfolioHolding> = {}): PortfolioHolding => ({
  key,
  symbol,
  name: `${symbol} token`,
  networkName,
  amount,
  transferable: amount,
  fiat,
  changePercent: null,
  ...extra,
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

const DOT_RELAY = holding('substrate:polkadot:dot', 'DOT', 'Polkadot', '10', '50', { changePercent: '2.5', transferable: '4' });
const DOT_HUB = holding('substrate:hub:dot', 'DOT', 'Asset Hub', '4', '20', { changePercent: '2.5' });
const ETH = holding('ethereum:1:eth', 'ETH', 'Ethereum', '1', '2000');
const REFS = holdingRefs([wallet('Main', [DOT_RELAY, ETH]), wallet('Savings', [DOT_HUB, DOT_RELAY])]);
const groupOf: GroupOf = (key) => (key === DOT_RELAY.key || key === DOT_HUB.key ? { id: 'dot', symbol: 'DOT', name: 'Polkadot' } : undefined);

describe('buildTokenLocations', () => {
  const dot = buildTokenLocations('group:dot', REFS, groupOf, '2120')!;

  it('gathers a group across every wallet and network, and sums it', () => {
    expect(dot).toMatchObject({ key: 'group:dot', symbol: 'DOT', name: 'Polkadot', amount: '24', fiat: '120', changePercent: '2.5' });
    expect(dot.holdings).toHaveLength(3);
  });

  it('lists holdings largest first, each with its wallet, network and share of the token', () => {
    expect(dot.holdings.map(({ walletName, networkName, fiat }) => [walletName, networkName, fiat])).toEqual([
      ['Main', 'Polkadot', '50'],
      ['Savings', 'Polkadot', '50'],
      ['Savings', 'Asset Hub', '20'],
    ]);
    expect(dot.holdings.map(({ share }) => Math.round(share))).toEqual([42, 42, 17]);
    expect(dot.holdings.map(({ id }) => id)).toEqual(['addr-Main|substrate:polkadot:dot', 'addr-Savings|substrate:polkadot:dot', 'addr-Savings|substrate:hub:dot']);
  });

  it('folds one network across wallets into one satellite, with its holdings under it', () => {
    expect(dot.networks.map(({ name, fiat, amount }) => [name, fiat, amount])).toEqual([
      ['Polkadot', '100', '20'],
      ['Asset Hub', '20', '4'],
    ]);
    expect(dot.networks[0].holdings.map(({ walletName }) => walletName)).toEqual(['Main', 'Savings']);
    expect(dot.networks.reduce((sum, { share }) => sum + share, 0)).toBeCloseTo(100, 6);
  });

  it("says how much of the token's amount cannot be sent now", () => {
    expect(dot.holdings.find(({ walletName, networkName }) => walletName === 'Main' && networkName === 'Polkadot')).toMatchObject({ amount: '10', transferable: '4', held: '6' });
    expect(dot.holdings.find(({ networkName }) => networkName === 'Asset Hub')?.held).toBe('0');
  });

  it("gives the token's share of everything counted in the scope", () => {
    expect(dot.portfolioShare).toBeCloseTo((120 / 2120) * 100, 6);
    expect(buildTokenLocations('group:dot', REFS, groupOf, '0')?.portfolioShare).toBe(0);
  });

  it('keeps a single asset on its own, and never merges two that only share a symbol', () => {
    const lookalike = holding('evm:56:dot', 'DOT', 'BNB Chain', '1', '5');
    const refs = holdingRefs([wallet('Main', [DOT_RELAY, lookalike])]);

    expect(buildTokenLocations(lookalike.key, refs, groupOf, '55')).toMatchObject({ symbol: 'DOT', fiat: '5' });
    expect(buildTokenLocations('group:dot', refs, groupOf, '55')?.fiat).toBe('50');
  });

  it('has nothing to say about a token nobody holds', () => {
    expect(buildTokenLocations('group:none', REFS, groupOf, '2120')).toBeUndefined();
  });

  it('never reports a negative reserved part when a provider says more can be sent than is held', () => {
    const refs = holdingRefs([wallet('Main', [holding('substrate:x:y', 'Y', 'X', '5', '5', { transferable: '7' })])]);

    expect(buildTokenLocations('substrate:x:y', refs, () => undefined, '5')?.holdings[0].held).toBe('0');
  });
});
