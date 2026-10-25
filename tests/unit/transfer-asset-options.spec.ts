import { APIItemState } from '@extension-base/api/types/networks';
import { describe, expect, it, vi } from 'vitest';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';

// The helpers under test are pure; the stores are only used by other exports of the module.
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

import {
  calcTransferableSendMinusFee,
  findTransferAssetGroup,
  getCurrencyOptions,
  getTransferAssetOptions,
  getTransferAssetOptionValue,
  parseTransferAssetOptionValue,
} from '@/helpers/currencies';

const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const ASSET_HUB_USDT = 'ea33432f-9bd9-4d42-93bc-cd45a0e8a44c';

const network = (name: string, rank?: number, extra: Partial<NetworkJson> = {}): NetworkJson =>
  ({ name, chainId: name.toLowerCase(), active: true, ecosystem: 'substrate', rank, assets: [], ...extra }) as NetworkJson;

const networks = [
  network('Ethereum', 1, { ecosystem: 'ethereumBased' }),
  network('Polygon', 5, { ecosystem: 'ethereumBased' }),
  network('Arbitrum One', 7, { ecosystem: 'ethereumBased' }),
  network('OP Mainnet', 8, { ecosystem: 'ethereumBased' }),
  network('Polkadot', 2),
  network('Polkadot AssetHub', 3),
  network('Bitcoin', 4, { ecosystem: 'bitcoin' }),
];

const getNetwork = (name: string) => networks.find((item) => item.name.toLowerCase() === name.toLowerCase());

// Registry-shaped groups: one group per (asset, network), balance names are lowercase network names.
const group = ({
  id,
  networkName,
  symbol,
  tokenName,
  total,
  priceId,
  currencyId,
  relayChain,
}: {
  id: string;
  networkName: string;
  symbol: string;
  tokenName: string;
  total: string;
  priceId?: string;
  currencyId?: string;
  relayChain: string;
}): TokenGroup =>
  ({
    groupId: id,
    mainNetwork: networkName,
    priceId,
    symbol,
    tokenName,
    relayChain,
    icon: `${symbol}-icon`,
    providers: [],
    balances: [
      {
        state: APIItemState.READY,
        name: networkName.toLowerCase(),
        id,
        currencyId,
        symbol,
        priceId,
        precision: 18,
        type: 'normal',
        icon: `${networkName}-icon`,
        total,
        transferable: total,
      } as BalanceItem,
    ],
  }) as TokenGroup;

const groups: TokenGroup[] = [
  group({ id: 'usdt-eth', networkName: 'Ethereum', symbol: 'usdt', tokenName: 'Tether USD', total: '10', priceId: 'tether', relayChain: 'ethereum' }),
  group({ id: 'usdt-polygon', networkName: 'Polygon', symbol: 'usdt', tokenName: 'Tether USD', total: '300', priceId: 'tether', relayChain: 'ethereum' }),
  group({ id: 'usdt-arbitrum', networkName: 'Arbitrum One', symbol: 'usdt', tokenName: 'Tether USD', total: '0', priceId: 'tether', relayChain: 'ethereum' }),
  group({ id: DAI, networkName: 'Arbitrum One', symbol: 'dai', tokenName: 'Dai', total: '1', priceId: 'dai', relayChain: 'ethereum' }),
  group({ id: DAI, networkName: 'OP Mainnet', symbol: 'dai', tokenName: 'Dai', total: '25', priceId: 'dai', relayChain: 'ethereum' }),
  group({ id: DOT, networkName: 'Polkadot', symbol: 'dot', tokenName: 'Polkadot', total: '2', priceId: 'polkadot', relayChain: 'polkadot' }),
  group({ id: DOT, networkName: 'Polkadot AssetHub', symbol: 'dot', tokenName: 'Polkadot', total: '0.5', priceId: 'polkadot', relayChain: 'polkadot' }),
  group({ id: ASSET_HUB_USDT, networkName: 'Polkadot AssetHub', symbol: 'usdt', tokenName: 'Tether USD', total: '0', priceId: 'tether', currencyId: '1984', relayChain: 'polkadot' }),
];

const prices: Record<string, number> = { tether: 1, dai: 1, polkadot: 5 };
const getPrice = (priceId: string) => prices[priceId] ?? 0;

describe('transfer asset options', () => {
  it('labels every option "SYMBOL · Network" and never by relay chain', () => {
    const options = getTransferAssetOptions(groups, getNetwork, { getPrice });
    const names = options.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'USDT · Ethereum',
        'USDT · Polygon',
        'USDT · Arbitrum One',
        'DAI · Arbitrum One',
        'DAI · OP Mainnet',
        'DOT · Polkadot',
        'DOT · Polkadot AssetHub',
        'USDT · Polkadot AssetHub',
      ])
    );
    names.forEach((name) => expect(name).not.toMatch(/\(ETHEREUM\)|\(POLKADOT\)/));

    // The legacy SORA swap labels stay untouched.
    expect(getCurrencyOptions(groups.slice(0, 2)).map(({ name }) => name)).toEqual(['USDT (ETHEREUM)', 'USDT (ETHEREUM)']);
  });

  it('gives each (asset, network) a unique value that round-trips to the registry id and network', () => {
    const options = getTransferAssetOptions(groups, getNetwork, { getPrice });
    const values = options.map(({ value }) => value);

    expect(new Set(values).size).toBe(values.length);
    expect(values).toHaveLength(groups.length);

    const opDai = options.find(({ name }) => name === 'DAI · OP Mainnet')!;
    expect(parseTransferAssetOptionValue(opDai.value)).toEqual({ assetId: DAI, network: 'OP Mainnet' });

    const assetHubDot = options.find(({ name }) => name === 'DOT · Polkadot AssetHub')!;
    expect(parseTransferAssetOptionValue(assetHubDot.value)).toEqual({ assetId: DOT, network: 'Polkadot AssetHub' });

    for (const { value } of options) {
      const { assetId, network: networkName } = parseTransferAssetOptionValue(value);
      expect(getTransferAssetOptionValue(assetId, networkName)).toBe(value);
    }

    // A plain id from an older caller parses without a network.
    expect(parseTransferAssetOptionValue(DOT)).toEqual({ assetId: DOT, network: '' });
  });

  it('orders by fiat value, then balance, then symbol and network rank', () => {
    const names = getTransferAssetOptions(groups, getNetwork, { getPrice }).map(({ name }) => name);

    expect(names).toEqual([
      'USDT · Polygon', // $300
      'DAI · OP Mainnet', // $25
      'DOT · Polkadot', // $10, symbol breaks the tie
      'USDT · Ethereum', // $10
      'DOT · Polkadot AssetHub', // $2.5
      'DAI · Arbitrum One', // $1
      'USDT · Polkadot AssetHub', // zero balance, network rank 3
      'USDT · Arbitrum One', // zero balance, network rank 7
    ]);

    // Without prices, a held balance still comes before an empty one.
    const unpriced = getTransferAssetOptions(groups, getNetwork).map(({ name }) => name);
    expect(unpriced.indexOf('USDT · Arbitrum One')).toBeGreaterThan(unpriced.indexOf('DAI · Arbitrum One'));
  });

  it('shows the token name with the total balance and the asset icon', () => {
    const option = getTransferAssetOptions(groups, getNetwork, { getPrice }).find(
      ({ name }) => name === 'USDT · Polygon'
    )!;

    expect(option.subName).toBe('Tether USD · 300');
    expect(option.icon).toBe('usdt-icon');
  });

  it('skips networks that are unknown or not available for sending', () => {
    const withBitcoin = [
      ...groups,
      group({ id: 'btc', networkName: 'Bitcoin', symbol: 'btc', tokenName: 'Bitcoin', total: '1', relayChain: 'bitcoin' }),
      group({ id: 'ghost', networkName: 'Removed network', symbol: 'gst', tokenName: 'Ghost', total: '1', relayChain: 'ghost' }),
    ];
    const names = getTransferAssetOptions(withBitcoin, getNetwork, {
      isNetworkAvailable: ({ ecosystem }) => ecosystem !== 'bitcoin',
    }).map(({ name }) => name);

    expect(names).not.toContain('BTC · Bitcoin');
    expect(names.some((name) => name.startsWith('GST'))).toBe(false);
  });
});

describe('network-scoped transfer asset lookup', () => {
  it('resolves a shared registry id on the requested network instead of the first match', () => {
    expect(findTransferAssetGroup(groups, DAI, 'OP Mainnet')?.balances[0].name).toBe('op mainnet');
    expect(findTransferAssetGroup(groups, DAI, 'arbitrum one')?.balances[0].name).toBe('arbitrum one');
    expect(findTransferAssetGroup(groups, DOT, 'Polkadot AssetHub')?.balances[0].name).toBe('polkadot assethub');
    expect(findTransferAssetGroup(groups, DOT, 'Polkadot')?.balances[0].name).toBe('polkadot');
  });

  it('accepts the canonical id the portfolio puts in asset routes', () => {
    // Polkadot AssetHub USDT is opened from the portfolio as its currencyId, 1984.
    const assetHubUsdt = findTransferAssetGroup(groups, '1984', 'Polkadot AssetHub');

    expect(assetHubUsdt?.groupId).toBe(ASSET_HUB_USDT);
    expect(findTransferAssetGroup(groups, '1984', 'Polkadot')).toBeUndefined();
  });

  it('prefers a registry id over a canonical id that happens to collide on the same network', () => {
    const colliding = [
      group({ id: 'asset-b', networkName: 'Polkadot AssetHub', symbol: 'bbb', tokenName: 'B', total: '1', currencyId: 'asset-a', relayChain: 'polkadot' }),
      group({ id: 'asset-a', networkName: 'Polkadot AssetHub', symbol: 'aaa', tokenName: 'A', total: '1', relayChain: 'polkadot' }),
    ];

    expect(findTransferAssetGroup(colliding, 'asset-a', 'Polkadot AssetHub')?.symbol).toBe('aaa');
  });

  it('falls back to the id-only match for routes whose network does not resolve', () => {
    expect(findTransferAssetGroup(groups, DAI, 'optimism')?.balances[0].name).toBe('arbitrum one');
    expect(findTransferAssetGroup(groups, DAI, '')?.balances[0].name).toBe('arbitrum one');
    expect(findTransferAssetGroup(groups, '', 'OP Mainnet')).toBeUndefined();
    expect(findTransferAssetGroup(undefined, DAI, 'OP Mainnet')).toBeUndefined();
  });

  it('treats a group without a balance on the network as having nothing to send there', () => {
    const arbitrumDai = findTransferAssetGroup(groups, DAI, 'Arbitrum One');

    expect(calcTransferableSendMinusFee(arbitrumDai, 'OP Mainnet', '0')).toBe('0');
    expect(calcTransferableSendMinusFee(arbitrumDai, 'Arbitrum One', '0')).toBe('1');
  });
});
