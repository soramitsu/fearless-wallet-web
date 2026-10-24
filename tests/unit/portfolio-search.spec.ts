import { APIItemState } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { PortfolioSectionsInput } from '@/portfolio/assetIdentity';
import { buildPortfolioSections, buildPortfolioSummary, createAssetKey } from '@/portfolio/assetIdentity';

const ethereum = {
  name: 'Ethereum', ecosystem: 'ethereumBased', chainId: '1', icon: 'eth', rank: 1,
  assets: [
    { id: '0xAaAa', symbol: 'USD', name: 'Dollar', priceId: 'dollar-a' },
    { id: '0xBbBb', symbol: 'USD', name: 'Other dollar', priceId: 'dollar-b' },
  ],
} as unknown as NetworkJson;
const sepolia = { ...ethereum, name: 'Sepolia', chainId: '11155111', options: ['testnet'] } as NetworkJson;
const key = (id: string, network = ethereum) => createAssetKey({ ecosystem: network.ecosystem!, chainId: network.chainId, assetId: id });
const balance = (id = '0xAaAa', overrides: Partial<BalanceItem> = {}): BalanceItem => ({
  id, name: ethereum.name, symbol: 'USD', icon: 'usd', type: 'erc20', precision: 18, total: '0', transferable: '0',
  state: APIItemState.READY, assetMetadataTrust: 'verified', assetMetadataSource: 'registry', ...overrides,
});
const group = (balances: BalanceItem[], groupId = 'dollar'): TokenGroup => ({
  groupId, balances, symbol: 'USD', tokenName: 'Dollar', icon: 'usd', providers: [], mainNetwork: ethereum.name,
  relayChain: 'ethereum' as never,
});
const input = (overrides: Partial<PortfolioSectionsInput> = {}): PortfolioSectionsInput => ({
  groups: [group([balance()])], networks: [ethereum], prices: { 'dollar-a': 2, 'dollar-b': 3 },
  preferences: {}, addressForNetwork: () => '0xOwner', hideZero: true, search: 'usd', ...overrides,
});

describe('portfolio search visibility and totals', () => {
  it('finds verified zero and hidden tokens without changing saved preferences or counting hidden holdings', () => {
    const preferences = { [key('0xAaAa')]: 'hidden' } as const;
    const query = input({ groups: [group([balance('0xAaAa', { total: '7' }), balance('0xBbBb')])], preferences });

    expect(buildPortfolioSections({ ...query, search: '' })).toEqual([]);
    const [section] = buildPortfolioSections(query);
    expect(section.assets).toHaveLength(2);
    expect(section.assets[0]).toMatchObject({ hidden: true, preference: 'hidden', balanceText: '7' });
    expect(section.assets[1]).toMatchObject({ hasBalance: false, balanceText: '0', isReady: true });
    expect(section).toMatchObject({ subtotal: '0', hasPricedAssets: false });
    expect(preferences).toEqual({ [key('0xAaAa')]: 'hidden' });
    expect(buildPortfolioSummary(query)).toMatchObject({ total: '0', hiddenValue: '14' });
  });

  it('preserves locked holdings and their value even when nothing is transferable', () => {
    const [section] = buildPortfolioSections(input({ groups: [group([balance('0xAaAa', { total: '15', transferable: '0' })])] }));
    expect(section.assets[0]).toMatchObject({ balanceText: '15', transferableText: '0', hasBalance: true });
    expect(section.subtotal).toBe('30');
  });

  it('does not revive hidden unverified tokens or price detected and explicitly shown unverified tokens', () => {
    const unknown = (id: string) => balance(id, { total: '1000', assetMetadataTrust: 'unverified', priceId: 'dollar-a', priceAssetKey: key(id) });
    const [section] = buildPortfolioSections(input({
      groups: [group([unknown('hidden'), unknown('detected'), unknown('shown')])],
      preferences: { [key('hidden')]: 'hidden', [key('shown')]: 'shown' },
    }));
    expect(section.assets.map(({ assetId }) => assetId)).toEqual(['shown']);
    expect(section.detectedAssets.map(({ assetId }) => assetId)).toEqual(['detected']);
    expect(section.assets[0].fiatValue).toBeNull();
    expect(section.detectedAssets[0].fiatValue).toBeNull();
    expect(section.subtotal).toBe('0');
  });

  it('preserves the distinction between unloaded, failed and confirmed zero balances', () => {
    const result = (overrides: Partial<BalanceItem>) => buildPortfolioSections(input({ groups: [group([balance('0xAaAa', overrides)])] }))[0].assets[0];
    expect(result({ state: APIItemState.PENDING })).toMatchObject({ isReady: false, balanceUnavailable: false, balanceFailed: false });
    expect(result({ state: APIItemState.ERROR, total: undefined, transferable: undefined })).toMatchObject({ isReady: false, balanceUnavailable: true, balanceFailed: true });
    expect(result({})).toMatchObject({ isReady: true, balanceUnavailable: false, hasBalance: false });
  });

  it('requires a wallet address and wallet scope for zero rows, and obeys the strict network filter', () => {
    expect(buildPortfolioSections(input({ addressForNetwork: () => '' }))).toEqual([]);
    expect(buildPortfolioSections(input({ walletScope: () => false }))).toEqual([]);
    expect(buildPortfolioSections(input({ networkFilter: () => false }))).toEqual([]);
    const funded = input({ groups: [group([balance('0xAaAa', { total: '2' })])], walletScope: () => false });
    expect(buildPortfolioSections(funded)[0].subtotal).toBe('4');
    expect(buildPortfolioSections({ ...funded, networkFilter: () => false })).toEqual([]);
  });

  it('keeps testnets opt-in, requiring a selected or named testnet to list its zero balances', () => {
    const query = input({ networks: [sepolia], groups: [group([balance('0xAaAa', { name: sepolia.name })])] });
    expect(buildPortfolioSections({ ...query, search: 'Sepolia' })).toEqual([]);
    expect(buildPortfolioSections({ ...query, showTestnets: true })).toEqual([]);
    expect(buildPortfolioSections({ ...query, showTestnets: true, isSelectedNetwork: () => true })[0].assets).toHaveLength(1);
    expect(buildPortfolioSections({ ...query, showTestnets: true, search: 'Sepolia' })[0].assets).toHaveLength(1);
    const funded = buildPortfolioSections({ ...query, showTestnets: true, groups: [group([balance('0xAaAa', { name: sepolia.name, total: '5' })])] });
    expect(funded[0]).toMatchObject({ subtotal: '0', hasPricedAssets: false, isTestnet: true });
  });

  it('deduplicates differently cased EVM placeholders and loaded rows without conflating same-symbol contracts', () => {
    const [section] = buildPortfolioSections(input({ groups: [
      group([balance('0xAAAA', { state: APIItemState.PENDING }), balance('0xBbBb', { total: '3' })], 'placeholder'),
      group([balance('0xaaaa', { total: '2', timestamp: 10 })], 'loaded'),
      group([balance('0xAaAa', { total: '1', timestamp: 5 })], 'older'),
    ] }));
    expect(section.assets.map(({ key: assetKey }) => assetKey)).toEqual([key('0xBbBb'), key('0xAaAa')]);
    expect(section.assets.map(({ balanceText }) => balanceText)).toEqual(['3', '2']);
    expect(section.subtotal).toBe('13');
  });

  it('ranks an exact zero symbol ahead of a prefix while putting a funded result first', () => {
    const ranked = { ...ethereum, assets: [
      { id: 'native', symbol: 'USDX', name: 'Dollar native' },
      { id: 'exact', symbol: 'USD', name: 'Dollar' },
      { id: 'holding', symbol: 'USDC', name: 'Dollar holding' },
    ] } as NetworkJson;
    const [section] = buildPortfolioSections(input({ networks: [ranked], groups: [group([
      balance('native', { isNative: true }), balance('exact'), balance('holding', { total: '1' }),
    ])] }));
    expect(section.assets.map(({ assetId }) => assetId)).toEqual(['holding', 'exact', 'native']);
  });

  it('ignores a leftover search query in Manage and never changes the wallet-wide total to the filtered result', () => {
    const query = input({ groups: [group([balance('0xAaAa', { total: '4' })])], search: 'no-match' });
    expect(buildPortfolioSections(query)).toEqual([]);
    expect(buildPortfolioSections({ ...query, mode: 'manage' })[0].assets).toHaveLength(1);
    expect(buildPortfolioSummary(query).total).toBe('8');
  });
});
