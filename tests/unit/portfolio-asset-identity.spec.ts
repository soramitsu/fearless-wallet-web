import { APIItemState } from '@extension-base/api/types/networks';
import { describe, expect, it } from 'vitest';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import {
  buildPortfolioSections,
  buildPortfolioSummary,
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

  it('excludes presentation hides from net worth, reports them, and still excludes unverified same-symbol holdings', () => {
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

    const hidden = { [createAssetKey({ ecosystem: 'ton', chainId: 'ton-mainnet', assetId: 'EQ_Verified' })]: 'hidden' } as const;

    expect(buildPortfolioSummary(input).total).toBe('4');
    expect(buildPortfolioSummary({ ...input, preferences: hidden })).toMatchObject({
      total: '0',
      hiddenValue: '4',
      hiddenCount: 1,
      hiddenFundedKeys: ['ton:ton-mainnet:EQ_Verified'],
      unpricedCount: 0,
    });
    // The hidden row leaves the view, and the unverified holding only appears as a detected asset worth nothing.
    const [section] = buildPortfolioSections({ ...input, preferences: hidden });
    expect(section.assets).toEqual([]);
    expect(section.detectedAssets.map(({ assetId }) => assetId)).toEqual(['EQ_Unverified']);
    expect(section.subtotal).toBe('0');
    expect(buildPortfolioSections({ ...input, preferences: hidden, surfaceDiscoveredAssets: false })).toEqual([]);
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

  it('the default zero rule shows the listed utility assets of non-testnet mainnets, plus favourites', () => {
    const networks = readSnapshot().filter(({ disabled }) => !disabled);
    const byName = (name: string) => networks.find((candidate) => candidate.name === name)!;
    const zeroGroups = (names: string[]): TokenGroup[] =>
      names.flatMap((name) =>
        byName(name).assets.map((asset) => ({
          balances: [{
            assetMetadataSource: 'registry',
            assetMetadataTrust: 'verified',
            currencyId: asset.currencyId,
            icon: asset.icon,
            id: asset.id,
            isNative: asset.isNative,
            isUtility: asset.isUtility,
            name: name.toLowerCase(),
            precision: asset.precision,
            state: APIItemState.READY,
            symbol: asset.symbol,
            total: '0',
            transferable: '0',
          } as BalanceItem],
          groupId: asset.id,
          icon: asset.icon,
          mainNetwork: name,
          providers: [],
          relayChain: name as never,
          symbol: asset.symbol,
          tokenName: asset.name,
        }))
      );
    const rows = (input: Partial<Parameters<typeof buildPortfolioSections>[0]> = {}) =>
      buildPortfolioSections({
        addressForNetwork: () => 'owner',
        groups: zeroGroups(['SORA Mainnet', 'Westend', 'Acala', 'X Layer Mainnet']),
        networks,
        preferences: {},
        prices: {},
        showTestnets: true,
        ...input,
      }).flatMap(({ name, assets }) => assets.map(({ symbol }) => `${symbol}@${name}`));

    // SORA flags ten tokens `isNative`; only XOR is listed. X Layer lists OKB, not WOKB (also `isUtility`).
    // Westend (rank 108) is a testnet; Acala is unranked and not a favourite.
    expect(rows()).toEqual(['XOR@SORA Mainnet', 'OKB@X Layer Mainnet']);
    expect(rows({ networks: networks.map((network) => (network.name === 'Acala' ? { ...network, favorite: ['owner'] } : network)) }))
      .toEqual(expect.arrayContaining(['ACA@Acala']));
    expect(rows({ networks: networks.map((network) => (network.name === 'Westend' ? { ...network, favorite: ['owner'] } : network)) }))
      .not.toContain('WND@Westend');
    expect(rows({ hideZero: true })).toEqual([]);
  });

  it('renders an explicitly shown zero verified asset with a zero balance', () => {
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

    const input = { addressForNetwork: () => 'EQ', groups, networks: [network], prices: {} };

    expect(buildPortfolioSections({ ...input, preferences: {} })).toEqual([]);
    const [section] = buildPortfolioSections({ ...input, preferences: { [key]: 'shown' } });
    expect(section.assets).toEqual([expect.objectContaining({ assetId: 'EQ_Zero_Shown', balanceText: '0', hasBalance: false })]);
    // Hide zero is a filter over the view; the explicit choice itself stays stored.
    expect(buildPortfolioSections({ ...input, preferences: { [key]: 'shown' }, hideZero: true })).toEqual([]);
  });
});
