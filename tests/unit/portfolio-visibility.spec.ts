import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { BN } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/util';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import { WalletEcosystem } from '@/interfaces';
import {
  buildPortfolioSections,
  buildPortfolioSummary,
  createAssetKey,
  filterSectionsBySearch,
  scopeNetworksToWallet,
  splitZeroSections,
  type AssetPreference,
  type PortfolioNetworkSection,
} from '@/portfolio/assetIdentity';
import { formatBalance } from '@/util/balances';

const snapshot = readSnapshot();
// Enabled networks, testnets included: the portfolio, not the network list, decides what a testnet shows.
const networkMap = Object.fromEntries(
  snapshot.filter(({ disabled }) => !disabled).map((network) => [network.name, { ...network, favorite: [] }])
) as Record<string, NetworkJson>;
const networks = Object.values(networkMap);
const network = (name: string) => networkMap[name];

const PRICES = { polkadot: 5, ethereum: 2000, tether: 1, 'usd-coin': 1, kusama: 20, enjincoin: 0.1 };

function walletGroups(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  groups.forEach(({ balances }) =>
    balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: '0', transferable: '0' }))
  );
  return groups;
}

function fund(groups: TokenGroup[], networkName: string, symbol: string, balance: Record<string, string>) {
  const items = groups
    .flatMap(({ balances }) => balances)
    .filter((item) => item.name === networkName.toLowerCase() && item.symbol === symbol);
  if (!items.length) throw new Error(`No ${symbol} on ${networkName}`);
  items.forEach((item) => Object.assign(item, balance));
}

const keyOf = (networkName: string, symbol: string): string => {
  const { ecosystem, chainId, assets } = network(networkName);
  const asset = assets.find((candidate) => candidate.symbol === symbol)!;
  return createAssetKey({ ecosystem: String(ecosystem), chainId, assetId: String(asset.currencyId ?? asset.id) });
};

const base = (groups: TokenGroup[], preferences: Record<string, AssetPreference> = {}) => ({
  groups,
  networks,
  prices: PRICES,
  preferences,
  addressForNetwork: () => 'wallet',
});

const rowsOf = (sections: PortfolioNetworkSection[]) =>
  sections.flatMap(({ name, assets }) => assets.map(({ symbol }) => `${symbol}@${name}`));

const subtotalSum = (sections: PortfolioNetworkSection[]) =>
  sections.reduce((sum, { subtotal }) => sum.add(new FPNumber(subtotal)), FPNumber.ZERO).toString();

describe('portfolio value definition', () => {
  it('counts the total balance, so staked and locked funds stay in the value', () => {
    // A Substrate account with free 10, reserved 5 and frozen 8, as SubstrateBalanceService formats it.
    const formatted = formatBalance(
      { free: new BN('100000000000'), reserved: new BN('50000000000'), frozen: new BN('80000000000') } as unknown as AccountData,
      10
    );
    expect(formatted).toMatchObject({ total: '15', transferable: '-3' });

    const groups = walletGroups();
    fund(groups, 'Polkadot', 'dot', { free: '10', reserved: '5', frozen: '8', total: formatted.total, transferable: formatted.transferable });
    const [section] = buildPortfolioSections(base(groups)).filter(({ name }) => name === 'Polkadot');

    expect(section.assets[0]).toMatchObject({ symbol: 'DOT', balanceText: '15', transferableText: '0', fiatValue: '75' });
    expect(section.subtotal).toBe('75');
    expect(buildPortfolioSummary(base(groups)).total).toBe('75');
  });

  it('adds the hidden value back to exactly the total before the hide', () => {
    const groups = walletGroups();
    fund(groups, 'Polkadot', 'dot', { total: '2', transferable: '2' });
    fund(groups, 'Polkadot AssetHub', 'usdt', { total: '30', transferable: '30' });
    fund(groups, 'Ethereum', 'eth', { total: '0.5', transferable: '0.5' });
    const before = buildPortfolioSummary(base(groups));
    const hidden = { [keyOf('Polkadot AssetHub', 'usdt')]: 'hidden' as const };
    const after = buildPortfolioSummary(base(groups, hidden));
    const sections = buildPortfolioSections(base(groups, hidden));

    expect(before.total).toBe('1040');
    expect(after).toMatchObject({ total: '1010', hiddenValue: '30', hiddenCount: 1 });
    expect(new FPNumber(after.total).add(new FPNumber(after.hiddenValue)).toString()).toBe(before.total);
    // Subtotals use the same set as the header, so the rows add up to it.
    expect(subtotalSum(sections)).toBe(after.total);
    expect(rowsOf(sections)).not.toContain('USDT@Polkadot AssetHub');
  });

  it('never counts a testnet, even a priced one, and hides testnets until asked', () => {
    const groups = walletGroups();
    fund(groups, 'Canary Matrixchain', 'cenj', { total: '1000', transferable: '1000' });
    fund(groups, 'CAGA Ankara Testnet', 'caga', { total: '7', transferable: '7' });
    fund(groups, 'Polkadot', 'dot', { total: '1', transferable: '1' });

    expect(buildPortfolioSummary(base(groups))).toMatchObject({ total: '5', unpricedCount: 0 });
    const view = rowsOf(buildPortfolioSections(base(groups)));
    expect(view[0]).toBe('DOT@Polkadot');
    expect(view.filter((row) => /Canary|CAGA/.test(row))).toEqual([]);

    const withTestnets = buildPortfolioSections({ ...base(groups), showTestnets: true });
    const canary = withTestnets.find(({ name }) => name === 'Canary Matrixchain')!;
    expect(canary).toMatchObject({ isTestnet: true, subtotal: '0', hasPricedAssets: false });
    expect(canary.assets[0]).toMatchObject({ symbol: 'CENJ', balanceText: '1000', isTestnet: true });
    expect(withTestnets.find(({ name }) => name === 'CAGA Ankara Testnet')?.isTestnet).toBe(true);
  });

  it('labels what the total leaves out: unpriced holdings and nomination-pool stakes', () => {
    const groups = walletGroups();
    fund(groups, 'Polkadot AssetHub', 'ded', { total: '1000', transferable: '1000' });
    expect(buildPortfolioSummary(base(groups))).toMatchObject({ total: '0', unpricedCount: 1, poolStakesExcluded: false });

    fund(groups, 'Polkadot', 'dot', { total: '1', transferable: '1' });
    expect(buildPortfolioSummary(base(groups))).toMatchObject({ total: '5', unpricedCount: 1, poolStakesExcluded: true });
  });
});

describe('portfolio visibility rules', () => {
  it('treats Hide zero as a filter: no preference changes, and a later deposit shows up by itself', () => {
    const groups = walletGroups();
    fund(groups, 'Polkadot', 'dot', { total: '1', transferable: '1' });
    const preferences: Record<string, AssetPreference> = {};
    const visible = rowsOf(buildPortfolioSections(base(groups, preferences)));

    expect(visible).toEqual(expect.arrayContaining(['DOT@Polkadot', 'KSM@Kusama', 'XOR@SORA Mainnet', 'ETH@Ethereum']));
    expect(visible).not.toContain('USDT@Polkadot AssetHub');
    expect(rowsOf(buildPortfolioSections({ ...base(groups, preferences), hideZero: true }))).toEqual(['DOT@Polkadot']);
    expect(preferences).toEqual({});

    fund(groups, 'Polkadot AssetHub', 'usdt', { total: '3', transferable: '3' });
    expect(rowsOf(buildPortfolioSections({ ...base(groups, preferences), hideZero: true }))).toEqual([
      'DOT@Polkadot',
      'USDT@Polkadot AssetHub',
    ]);
  });

  it('lists hidden and zero verified rows in Manage, flagged, and ignores Hide zero there', () => {
    const groups = walletGroups();
    fund(groups, 'Polkadot', 'dot', { total: '1', transferable: '1' });
    const preferences = { [keyOf('Polkadot', 'dot')]: 'hidden' as const, [keyOf('Kusama', 'ksm')]: 'hidden' as const };
    const manage = buildPortfolioSections({ ...base(groups, preferences), mode: 'manage', hideZero: true });
    const assets = manage.flatMap((section) => section.assets);

    expect(assets.find(({ key }) => key === keyOf('Polkadot', 'dot'))).toMatchObject({ hidden: true, hasBalance: true });
    expect(assets.find(({ key }) => key === keyOf('Kusama', 'ksm'))).toMatchObject({ hidden: true, hasBalance: false });
    expect(assets.find(({ key }) => key === keyOf('Polkadot AssetHub', 'pink'))).toMatchObject({ hidden: false, hasBalance: false });
    expect(manage.find(({ name }) => name === 'Polkadot')?.subtotal).toBe('0');

    // View mode drops them; Show hidden keeps them, flagged and uncounted.
    expect(rowsOf(buildPortfolioSections(base(groups, preferences)))).not.toContain('DOT@Polkadot');
    const shown = buildPortfolioSections({ ...base(groups, preferences), showHidden: true });
    expect(shown.find(({ name }) => name === 'Polkadot')).toMatchObject({ subtotal: '0', assets: [expect.objectContaining({ hidden: true })] });
  });

  it('honours an explicit Shown at zero for a verified asset, unless Hide zero filters it', () => {
    const groups = walletGroups();
    const preferences = { [keyOf('Polkadot AssetHub', 'usdt')]: 'shown' as const };

    expect(rowsOf(buildPortfolioSections(base(groups, preferences)))).toContain('USDT@Polkadot AssetHub');
    expect(rowsOf(buildPortfolioSections({ ...base(groups, preferences), hideZero: true }))).toEqual([]);
  });

  it('keeps a funded verified asset visible and counted outside the wallet scope', () => {
    const groups = walletGroups();
    fund(groups, 'Ethereum', 'eth', { total: '1', transferable: '1' });
    const noEvm = scopeNetworksToWallet(undefined, { ethereumAddress: '' });
    const sections = buildPortfolioSections({ ...base(groups), walletScope: noEvm });

    expect(rowsOf(sections)).toContain('ETH@Ethereum');
    expect(rowsOf(sections).filter((row) => /@(BNB Smart Chain|Polygon|Moonbeam)$/.test(row))).toEqual([]);
    expect(buildPortfolioSummary({ ...base(groups), walletScope: noEvm }).total).toBe('2000');
  });

  it('keeps the header wallet-wide and independent of Hide zero, while a network filter only scopes its caption', () => {
    const groups = walletGroups();
    fund(groups, 'Polkadot', 'dot', { total: '2', transferable: '2' });
    fund(groups, 'Ethereum', 'eth', { total: '1', transferable: '1' });
    const summary = buildPortfolioSummary(base(groups));
    const polkadotOnly = (candidate: NetworkJson) => candidate.name === 'Polkadot';

    expect(summary.total).toBe('2010');
    expect(subtotalSum(buildPortfolioSections({ ...base(groups), hideZero: true }))).toBe(summary.total);
    expect(rowsOf(buildPortfolioSections({ ...base(groups), networkFilter: polkadotOnly }))).toEqual(['DOT@Polkadot']);
    expect(buildPortfolioSummary({ ...base(groups), networkFilter: polkadotOnly }).total).toBe('10');
  });
});

describe('portfolio list helpers', () => {
  const groups = walletGroups();
  fund(groups, 'Polkadot', 'dot', { total: '2', transferable: '2' });
  fund(groups, 'Polkadot AssetHub', 'dot', { total: '1', transferable: '1' });
  fund(groups, 'Polkadot AssetHub', 'usdt', { total: '5', transferable: '5' });
  fund(groups, 'Ethereum', 'usdt', { total: '7', transferable: '7' });
  const shown = Object.fromEntries(network('Polkadot AssetHub').assets.map((asset) => [keyOf('Polkadot AssetHub', asset.symbol), 'shown' as const]));
  const sections = buildPortfolioSections(base(groups, shown));

  it('searches network names first, then symbols and names, and leaves no empty networks', () => {
    const assetHub = filterSectionsBySearch(sections, ' assethub ');
    expect(assetHub.map(({ name }) => name)).toEqual(['Polkadot AssetHub']);
    expect(assetHub[0].assets).toHaveLength(sections.find(({ name }) => name === 'Polkadot AssetHub')!.assets.length);

    const usdt = filterSectionsBySearch(sections, 'USDT');
    expect(rowsOf(usdt).sort()).toEqual(['USDT@Ethereum', 'USDT@Polkadot AssetHub']);
    expect(usdt.every(({ assets }) => assets.length > 0)).toBe(true);
    expect(usdt.find(({ name }) => name === 'Polkadot AssetHub')?.subtotal).toBe('5');
    expect(filterSectionsBySearch(sections, '')).toBe(sections);
  });

  it('splits funded networks from zero-only ones', () => {
    const { funded, zeroOnly } = splitZeroSections(sections);

    expect(funded.map(({ name }) => name).sort()).toEqual(['Ethereum', 'Polkadot', 'Polkadot AssetHub']);
    expect(zeroOnly.map(({ name }) => name)).toEqual(expect.arrayContaining(['Kusama', 'SORA Mainnet']));
    expect(zeroOnly.every(({ assets }) => assets.every(({ hasBalance }) => !hasBalance))).toBe(true);
    expect(funded.length + zeroOnly.length).toBe(sections.length);
  });

  it('scopes a mobile wallet to its chains and an EVM-less wallet away from EVM networks', () => {
    const polkadot = network('Polkadot');
    const mobile = scopeNetworksToWallet({ chains: [polkadot.chainId] } as AccountJson, {
      ethereumAddress: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      isMobile: true,
    });
    expect(networks.filter(mobile).map(({ name }) => name)).toEqual(['Polkadot']);

    const substrateOnly = scopeNetworksToWallet(undefined, { ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate });
    expect(substrateOnly(polkadot)).toBe(true);
    expect(substrateOnly(network('Ethereum'))).toBe(false);
    expect(substrateOnly(network('Moonbeam'))).toBe(false);

    const tonOnly = scopeNetworksToWallet(undefined, { ethereumAddress: '', walletEcosystem: WalletEcosystem.Ton });
    expect(tonOnly(network('TON Mainnet'))).toBe(true);
    expect(tonOnly(polkadot)).toBe(false);
  });
});
