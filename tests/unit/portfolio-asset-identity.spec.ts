import { APIItemState } from '@extension-base/api/types/networks';
import { describe, expect, it } from 'vitest';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import {
  buildPortfolioSections,
  buildPortfolioSummary,
  buildAssetPreferenceSnapshot,
  createAssetKey,
  getCanonicalAssetId,
} from '@/portfolio/assetIdentity';

const network = {
  assets: [],
  chainId: 'ton-mainnet',
  ecosystem: 'ton',
  icon: 'ton',
  name: 'TON Mainnet',
} as unknown as NetworkJson;

const jetton = ({
  id,
  priceId,
  priceAssetKey,
  total,
  trust = 'verified',
  walletAddress,
}: {
  id: string;
  priceId?: string;
  priceAssetKey?: string;
  total: string;
  trust?: BalanceItem['assetMetadataTrust'];
  walletAddress: string;
}): BalanceItem => ({
  assetMetadataSource: 'indexer',
  assetMetadataTrust: trust,
  icon: 'ton',
  id,
  name: network.name,
  precision: 9,
  priceId,
  priceAssetKey:
    priceAssetKey ??
    (priceId ? createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: id }) : undefined),
  state: APIItemState.READY,
  symbol: 'USD',
  total,
  transferable: total,
  type: 'jetton',
  walletAddress: { toString: () => walletAddress } as BalanceItem['walletAddress'],
});

describe('portfolio canonical asset identity', () => {
  it('uses the Jetton master address instead of the per-owner Jetton wallet', () => {
    const firstOwner = jetton({ id: 'EQ_Master', total: '1', walletAddress: 'EQ_OwnerWallet_A' });
    const secondOwner = jetton({ id: 'EQ_Master', total: '1', walletAddress: 'EQ_OwnerWallet_B' });

    expect(getCanonicalAssetId(firstOwner)).toBe('EQ_Master');
    expect(getCanonicalAssetId(secondOwner)).toBe('EQ_Master');
  });

  it('keeps two same-symbol masters separate and prices only by the asset-bound price id', () => {
    const groups: TokenGroup[] = [
      {
        balances: [
          jetton({ id: 'EQ_Master_A', priceId: 'EQ_Master_A', total: '2', walletAddress: 'EQ_Wallet_A' }),
          jetton({ id: 'EQ_Master_B', priceId: 'EQ_Master_B', total: '3', walletAddress: 'EQ_Wallet_B' }),
          jetton({
            id: 'EQ_Master_C',
            priceId: 'EQ_Master_A',
            total: '100',
            trust: 'unverified',
            walletAddress: 'EQ_Wallet_C',
          }),
        ],
        groupId: 'legacy-symbol-group',
        icon: 'ton',
        mainNetwork: network.name,
        priceId: 'legacy-symbol-price',
        providers: [],
        relayChain: 'ton' as never,
        symbol: 'USD',
        tokenName: 'Dollar token',
      },
    ];

    const [section] = buildPortfolioSections({
      addressForNetwork: () => 'EQ_Owner',
      groups,
      networks: [network],
      preferences: {},
      prices: {
        EQ_Master_A: 2,
        EQ_Master_B: 5,
        'legacy-symbol-price': 1_000,
      },
    });

    expect(section.assets.map(({ assetId }) => assetId)).toEqual(['EQ_Master_B', 'EQ_Master_A']);
    expect(section.assets.map(({ fiatValue, priceTrust }) => ({ fiatValue, priceTrust }))).toEqual([
      { fiatValue: '15', priceTrust: 'canonicalAsset' },
      { fiatValue: '4', priceTrust: 'canonicalAsset' },
    ]);
    expect(section.detectedAssets).toHaveLength(1);
    expect(section.detectedAssets[0]).toMatchObject({ assetId: 'EQ_Master_C', fiatValue: null });
    expect(section.subtotal).toBe('19');
  });

  it('normalizes EVM contract addresses but preserves case-sensitive canonical ids', () => {
    expect(createAssetKey({ ecosystem: 'evm', chainId: '1', assetId: '0xAbCd' })).toBe('evm:1:0xabcd');
    expect(createAssetKey({ ecosystem: 'ethereumBased', chainId: '1', assetId: '0xAbCd' })).toBe(
      'ethereumbased:1:0xabcd'
    );
    expect(createAssetKey({ ecosystem: 'solana', chainId: 'mainnet', assetId: 'AbCdMint' })).toBe(
      'solana:mainnet:AbCdMint'
    );
    expect(createAssetKey({ ecosystem: 'iroha', chainId: 'taira', assetId: 'Gold#Wonderland' })).toBe(
      'iroha:taira:Gold%23Wonderland'
    );
  });

  it('keeps net worth independent from presentation hides and excludes unverified same-symbol holdings', () => {
    const verified = jetton({ id: 'EQ_Verified', priceId: 'verified-price', total: '2', walletAddress: 'EQ_A' });
    const unverified = jetton({
      id: 'EQ_Unverified',
      priceId: 'verified-price',
      total: '999999999999999999999999999999',
      trust: 'unverified',
      walletAddress: 'EQ_B',
    });
    const groups = [{
      balances: [verified, unverified],
      groupId: 'legacy-usd',
      icon: 'ton',
      mainNetwork: network.name,
      priceId: 'verified-price',
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'USD',
      tokenName: 'USD',
    }] as TokenGroup[];
    const input = {
      addressForNetwork: () => 'EQ_Owner',
      groups,
      networks: [network],
      prices: { 'verified-price': 2 },
      priceChanges: { 'verified-price': 10 },
    };

    expect(buildPortfolioSummary(input).total).toBe('4');
    expect(
      buildPortfolioSections({
        ...input,
        preferences: { [createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: 'EQ_Verified' })]: 'hidden' },
      })[0]?.subtotal
    ).toBe('4');
    expect(buildPortfolioSummary(input).total).toBe('4');
  });

  it('keeps arbitrary-precision verified totals as decimal strings', () => {
    const groups = [{
      balances: [jetton({ id: 'EQ_Huge', priceId: 'huge-price', total: '9007199254740993.125', walletAddress: 'EQ_A' })],
      groupId: 'huge',
      icon: 'ton',
      mainNetwork: network.name,
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'HUGE',
      tokenName: 'Huge',
    }] as TokenGroup[];

    expect(
      buildPortfolioSummary({
        addressForNetwork: () => 'EQ_Owner',
        groups,
        networks: [network],
        prices: { 'huge-price': 1 },
      }).total
    ).toBe('9007199254740993.125');
  });

  it('builds migration tombstones from the full registry snapshot, not visible sections', () => {
    const registryNetwork = {
      ...network,
      assets: [
        { id: 'EQ_Zero', symbol: 'ZERO' },
        { id: 'EQ_Later', symbol: 'ZERO' },
      ],
    } as unknown as NetworkJson;
    const zero = jetton({ id: 'EQ_Zero', total: '0', walletAddress: 'EQ_A' });
    const groups = [{
      balances: [zero],
      groupId: 'legacy-zero',
      icon: 'ton',
      mainNetwork: network.name,
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'ZERO',
      tokenName: 'Zero',
    }] as TokenGroup[];

    expect(buildPortfolioSections({ addressForNetwork: () => 'EQ', groups, networks: [registryNetwork], preferences: {}, prices: {} }))
      .toHaveLength(0);
    expect(buildAssetPreferenceSnapshot(groups, [registryNetwork])).toEqual([
      expect.objectContaining({ groupId: 'EQ_Later', key: 'ton:ton-mainnet:EQ_Later' }),
      expect.objectContaining({ groupId: 'legacy-zero', key: 'ton:ton-mainnet:EQ_Zero' }),
    ]);
  });

  it('keeps discovery in shadow mode while preserving an explicit show preference', () => {
    const unverified = jetton({
      id: 'EQ_Shadow',
      total: '1',
      trust: 'unverified',
      walletAddress: 'EQ_A',
    });
    const groups = [{
      balances: [unverified],
      groupId: 'shadow',
      icon: 'ton',
      mainNetwork: network.name,
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'SHADOW',
      tokenName: 'Shadow',
    }] as TokenGroup[];
    const input = { addressForNetwork: () => 'EQ', groups, networks: [network], prices: {}, surfaceDiscoveredAssets: false };
    const key = createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: 'EQ_Shadow' });

    expect(buildPortfolioSections({ ...input, preferences: {} })).toEqual([]);
    expect(buildPortfolioSections({ ...input, preferences: { [key]: 'shown' } })[0].assets[0].assetId).toBe('EQ_Shadow');
  });

  it('uses the exact registry asset price and never inherits a same-symbol contract price', () => {
    const evmNetwork = {
      active: true,
      assets: [
        { currencyId: '0xAaAa', id: 'asset-a', priceId: 'price-a', symbol: 'USD' },
        { currencyId: '0xBbBb', id: 'asset-b', symbol: 'USD' },
      ],
      chainId: '1',
      ecosystem: 'ethereumBased',
      icon: 'ethereum',
      name: 'Ethereum',
    } as unknown as NetworkJson;
    const balance = (currencyId: string, id: string): BalanceItem => ({
      assetMetadataSource: 'registry',
      assetMetadataTrust: 'verified',
      currencyId,
      icon: 'usd',
      id,
      name: evmNetwork.name,
      precision: 18,
      priceId: 'price-a',
      state: APIItemState.READY,
      symbol: 'USD',
      total: '2',
      transferable: '2',
    } as BalanceItem);
    const groups = [{
      balances: [balance('0xAaAa', 'asset-a'), balance('0xBbBb', 'asset-b')],
      groupId: 'legacy-usd',
      icon: 'usd',
      mainNetwork: evmNetwork.name,
      providers: [],
      relayChain: 'ethereum' as never,
      symbol: 'USD',
      tokenName: 'USD',
    }] as TokenGroup[];

    const [section] = buildPortfolioSections({
      addressForNetwork: () => '0xOwner',
      groups,
      networks: [evmNetwork],
      preferences: {},
      prices: { 'price-a': 5 },
    });

    expect(section.assets).toEqual([
      expect.objectContaining({
        assetId: '0xAaAa',
        fiatValue: '10',
        key: 'ethereumbased:1:0xaaaa',
        priceTrust: 'canonicalAsset',
      }),
      expect.objectContaining({
        assetId: '0xBbBb',
        fiatValue: null,
        key: 'ethereumbased:1:0xbbbb',
        priceTrust: 'unavailable',
      }),
    ]);
    expect(section.subtotal).toBe('10');
  });

  it('does not count a verified indexer price unless it is bound to the exact AssetKey', () => {
    const indexed = jetton({
      id: 'EQ_Verified_But_Unbound',
      priceId: 'shared-symbol-price',
      priceAssetKey: createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: 'EQ_Other' }),
      total: '100',
      walletAddress: 'EQ_A',
    });
    const groups = [{
      balances: [indexed],
      groupId: 'legacy-usd',
      icon: 'ton',
      mainNetwork: network.name,
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'USD',
      tokenName: 'USD',
    }] as TokenGroup[];
    const input = {
      addressForNetwork: () => 'EQ_Owner',
      groups,
      networks: [network],
      prices: { 'shared-symbol-price': 999 },
    };

    const [section] = buildPortfolioSections({ ...input, preferences: {} });

    expect(section.assets[0]).toMatchObject({
      fiatValue: null,
      priceTrust: 'unavailable',
      unitPrice: null,
    });
    expect(section.subtotal).toBe('0');
    expect(buildPortfolioSummary(input).total).toBe('0');
  });

  it('shows an automatic zero native asset only on a pinned or ranked default network', () => {
    const nativeBalance = {
      assetMetadataSource: 'registry',
      assetMetadataTrust: 'verified',
      icon: 'dot',
      id: 'native',
      isNative: true,
      name: 'Quiet chain',
      precision: 10,
      state: APIItemState.READY,
      symbol: 'QUIET',
      total: '0',
      transferable: '0',
    } as BalanceItem;
    const groups = [{
      balances: [nativeBalance],
      groupId: 'native',
      icon: 'dot',
      mainNetwork: 'Quiet chain',
      providers: [],
      relayChain: 'substrate' as never,
      symbol: 'QUIET',
      tokenName: 'Quiet',
    }] as TokenGroup[];
    const baseNetwork = {
      active: false,
      assets: [{ id: 'native', symbol: 'QUIET' }],
      chainId: 'quiet',
      ecosystem: 'substrate',
      icon: 'quiet',
      name: 'Quiet chain',
    } as unknown as NetworkJson;
    const input = { addressForNetwork: () => 'owner', groups, preferences: {}, prices: {} };

    expect(buildPortfolioSections({ ...input, networks: [baseNetwork] })).toEqual([]);
    expect(buildPortfolioSections({ ...input, networks: [{ ...baseNetwork, active: true }] as NetworkJson[] }))
      .toEqual([]);
    expect(buildPortfolioSections({
      ...input,
      networks: [{ ...baseNetwork, favorite: ['owner'] }] as NetworkJson[],
    })).toHaveLength(1);
    expect(buildPortfolioSections({ ...input, networks: [{ ...baseNetwork, rank: 9 }] as NetworkJson[] }))
      .toHaveLength(1);
  });

  it('retains a shown preference without rendering a zero non-native asset', () => {
    const zero = jetton({ id: 'EQ_Zero_Shown', total: '0', walletAddress: 'EQ_A' });
    const groups = [{
      balances: [zero],
      groupId: 'zero-shown',
      icon: 'ton',
      mainNetwork: network.name,
      providers: [],
      relayChain: 'ton' as never,
      symbol: 'ZERO',
      tokenName: 'Zero',
    }] as TokenGroup[];
    const key = createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: 'EQ_Zero_Shown' });

    expect(buildPortfolioSections({
      addressForNetwork: () => 'EQ',
      groups,
      networks: [network],
      preferences: { [key]: 'shown' },
      prices: {},
    })).toEqual([]);
  });
});

describe('portfolio search', () => {
  type RegistryAsset = Partial<NetworkJson['assets'][number]> & { id: string; symbol: string; name: string };

  const chain = (name: string, chainId: string, ecosystem: string, assets: RegistryAsset[], extra = {}): NetworkJson =>
    ({ assets, chainId, ecosystem, favorite: [], icon: name, name, ...extra }) as unknown as NetworkJson;

  const bitcoin = chain('Bitcoin', 'bitcoin-mainnet', 'bitcoin', [
    { id: 'BTC', isNative: true, name: 'Bitcoin', priceId: 'bitcoin', symbol: 'BTC' },
  ]);
  const bitcoinTestnet = chain('Bitcoin Testnet', 'bitcoin-testnet', 'bitcoin', bitcoin.assets as RegistryAsset[], {
    options: ['testnet'],
  });
  const polygon = chain('Polygon', '137', 'ethereum', [
    { id: 'pol', isNative: true, isUtility: true, name: 'Polygon Ecosystem Token', priceId: 'pol', symbol: 'pol' },
    { id: '0xWbtcPolygon', name: 'wrapped btc', priceId: 'wbtc', symbol: 'wbtc' },
  ], { rank: 3 });
  const arbitrum = chain('Arbitrum One', '42161', 'ethereum', [
    { id: '0xWbtcArbitrum', name: 'wrapped btc', priceId: 'wbtc', symbol: 'wbtc' },
  ], { rank: 4 });
  const avalanche = chain('Avalanche C-Chain', '43114', 'ethereum', [
    { id: '0xBtcb', name: 'bitcoin', symbol: 'btc.b' },
  ], { rank: 6 });
  const kintsugi = chain('Kintsugi', '0xkintsugi', 'substrate', [{ id: 'kbtc', name: 'kintsugi ibtc', symbol: 'kbtc' }]);
  const networks = [bitcoin, bitcoinTestnet, polygon, arbitrum, avalanche, kintsugi];

  // The background seeds one verified placeholder per registry asset; a scan then marks it READY with its amount.
  const holding = (
    network: NetworkJson,
    assetId: string,
    total?: string,
    state = APIItemState.READY,
    trust: BalanceItem['assetMetadataTrust'] = 'verified'
  ): TokenGroup => {
    const asset: RegistryAsset = (network.assets.find(({ id }) => id === assetId) as RegistryAsset | undefined) ??
      { id: assetId, name: assetId, symbol: assetId };

    return {
      balances: [{
        assetMetadataSource: trust === 'verified' ? 'registry' : 'indexer',
        assetMetadataTrust: trust,
        icon: network.icon,
        id: assetId,
        isNative: asset.isNative,
        isUtility: asset.isUtility,
        name: network.name.toLowerCase(),
        precision: 8,
        priceId: asset.priceId,
        state,
        symbol: asset.symbol,
        total,
        transferable: total,
      } as BalanceItem],
      groupId: assetId,
      icon: network.icon,
      mainNetwork: network.name,
      priceId: asset.priceId,
      providers: [],
      relayChain: network.ecosystem as never,
      symbol: asset.symbol,
      tokenName: asset.name,
    } as TokenGroup;
  };
  const wallet = ({ wbtc = '0', testBtc }: { wbtc?: string; testBtc?: string } = {}): TokenGroup[] => [
    holding(bitcoin, 'BTC', '0'),
    holding(bitcoinTestnet, 'BTC', testBtc, testBtc ? APIItemState.READY : APIItemState.PENDING),
    holding(polygon, 'pol', '10'),
    holding(polygon, '0xWbtcPolygon', wbtc),
    holding(arbitrum, '0xWbtcArbitrum', '0'),
    holding(avalanche, '0xBtcb', '0'),
    holding(kintsugi, 'kbtc'),
  ];
  const wbtcOnPolygon = createAssetKey({ ecosystem: 'ethereum', chainId: '137', assetId: '0xWbtcPolygon' });
  const build = (
    search: string,
    { groups = wallet(), ...options }: Partial<Parameters<typeof buildPortfolioSections>[0]> = {}
  ) =>
    buildPortfolioSections({
      addressForNetwork: ({ name }) => `${name} address`,
      groups,
      networks,
      preferences: {},
      prices: { bitcoin: 60_000, pol: 5, wbtc: 60_000 },
      search,
      ...options,
    });
  const rows = (sections: ReturnType<typeof buildPortfolioSections>): string[] =>
    sections.map(({ assets, name }) => `${name}: ${assets.map(({ balanceText, symbol }) => `${symbol} ${balanceText}`).join(', ')}`);

  it('answers with tokens the wallet holds none of instead of no match', () => {
    expect(rows(build(''))).toEqual(['Polygon: POL 10']);
    expect(rows(build('btc'))).toEqual([
      'Bitcoin: BTC 0',
      'Avalanche C-Chain: BTC.B 0',
      'Polygon: WBTC 0',
      'Arbitrum One: WBTC 0',
      'Kintsugi: KBTC 0',
    ]);
    expect(rows(build('  BTC  '))).toEqual(rows(build('btc')));
    expect(build('btc').find(({ name }) => name === 'Kintsugi')?.assets[0].isReady).toBe(true);
    expect(build('zzz')).toEqual([]);
  });

  it('puts holdings first and totals only the rows the search lists', () => {
    const results = build('btc', { groups: wallet({ wbtc: '0.5' }) });

    expect(rows(results)[0]).toBe('Polygon: WBTC 0.5');
    expect(results[0]).toMatchObject({ hasPricedAssets: true, subtotal: '30000' });
    expect(build('btc')[2]).toMatchObject({ hasPricedAssets: false, name: 'Polygon', subtotal: '0' });
    expect(build('', { groups: wallet({ wbtc: '0.5' }) })[0].subtotal).toBe('30050');
  });

  it('lists a holding before a closer match on the same network', () => {
    const avalancheWithWbtc = chain('Avalanche C-Chain', '43114', 'ethereum', [
      { id: '0xBtcb', name: 'bitcoin', symbol: 'btc.b' },
      { id: '0xWbtcE', name: 'wrapped btc', priceId: 'wbtc', symbol: 'wbtc.e' },
    ], { rank: 6 });
    const groups = [holding(avalancheWithWbtc, '0xWbtcE', '0.5'), holding(avalancheWithWbtc, '0xBtcb', '0')];

    expect(rows(build('btc', { groups, networks: [avalancheWithWbtc] }))).toEqual([
      'Avalanche C-Chain: WBTC.E 0.5, BTC.B 0',
    ]);
  });

  it('answers with the loaded row, not the placeholder the background keeps beside it', () => {
    const solana = chain('Solana', 'solana-mainnet', 'solana', [{ id: 'SOL', isNative: true, name: 'Solana', symbol: 'SOL' }]);
    const placeholder = holding(solana, 'SOL', undefined, APIItemState.PENDING);
    const loaded = holding(solana, 'SOL', '0');
    // The scan writes the network's own spelling, the placeholder a lowercase one.
    loaded.balances[0].name = 'Solana';
    const search = (groups: TokenGroup[]) => build('sol', { groups, networks: [solana] });

    expect(rows(search([placeholder, loaded]))).toEqual(['Solana: SOL 0']);
    expect(search([placeholder, loaded])[0].assets[0].isReady).toBe(true);
    expect(rows(search([placeholder, holding(solana, 'SOL', undefined, APIItemState.PENDING)]))).toEqual(['Solana: SOL 0']);
    // Two rows that were both read may be two assets sharing an id: both stay.
    expect(rows(search([loaded, holding(solana, 'SOL', '0')]))).toEqual(['Solana: SOL 0, SOL 0']);
  });

  it('finds hidden tokens, which the list leaves out', () => {
    const preferences = { [wbtcOnPolygon]: 'hidden' as const };
    const groups = wallet({ wbtc: '0.5' });

    expect(rows(build('', { groups, preferences }))).toEqual(['Polygon: POL 10']);
    expect(build('wbtc', { groups, preferences })[0].assets[0]).toMatchObject({
      balanceText: '0.5',
      key: wbtcOnPolygon,
      preference: 'hidden',
    });
  });

  it('lists test-network zeros only when that network is named or selected', () => {
    const named = (search: string, options = {}) =>
      rows(build(search, options)).filter((row) => row.startsWith('Bitcoin Testnet'));

    expect(named('btc')).toEqual([]);
    // "bitcoin" names the main network first; its test network has to be named on its own.
    expect(named('bitcoin')).toEqual([]);
    expect(named('testnet')).toEqual(['Bitcoin Testnet: BTC 0']);
    expect(named('bitcoin test')).toEqual(['Bitcoin Testnet: BTC 0']);
    expect(named('btc', { isSelectedNetwork: ({ name }: NetworkJson) => name === 'Bitcoin Testnet' })).toEqual([
      'Bitcoin Testnet: BTC 0',
    ]);
    expect(named('btc', { groups: wallet({ testBtc: '0.1' }) })).toEqual(['Bitcoin Testnet: BTC 0.1']);
  });

  it('offers a zero only where the wallet has an address to receive it', () => {
    const noEvmAccount = ({ ecosystem, name }: NetworkJson) => (ecosystem === 'ethereum' ? '' : `${name} address`);

    expect(rows(build('btc', { addressForNetwork: noEvmAccount }))).toEqual(['Bitcoin: BTC 0', 'Kintsugi: KBTC 0']);
    expect(rows(build('btc', { addressForNetwork: noEvmAccount, groups: wallet({ wbtc: '0.5' }) }))[0]).toBe(
      'Polygon: WBTC 0.5'
    );
  });

  it('matches a network name from the start of a word', () => {
    expect(rows(build('poly'))).toEqual(['Polygon: POL 10, WBTC 0']);
    expect(rows(build('lygon'))).toEqual(['Polygon: POL 10']);
    expect(rows(build('c-chain'))).toEqual(['Avalanche C-Chain: BTC.B 0']);
  });

  it('never surfaces an unverified token at zero and keeps a funded one in review', () => {
    const unverified = (id: string, symbol: string, total: string): TokenGroup => {
      const group = holding(polygon, id, total, APIItemState.READY, 'unverified');

      return { ...group, balances: [{ ...group.balances[0], symbol }], symbol, tokenName: symbol };
    };
    const groups = [...wallet(), unverified('0xFakeBtc', 'BTC', '0'), unverified('0xAirdropBtc', 'XBTC', '5')];
    const polygonResult = build('btc', { groups }).find(({ name }) => name === 'Polygon');

    expect(polygonResult?.assets.map(({ assetId }) => assetId)).toEqual(['0xWbtcPolygon']);
    expect(polygonResult?.detectedAssets.map(({ assetId }) => assetId)).toEqual(['0xAirdropBtc']);
  });
});
