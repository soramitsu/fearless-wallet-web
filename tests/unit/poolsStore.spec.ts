jest.mock('ethers', () => ({}));

jest.mock('@/controllers', () => ({
  accountController: {
    getHidingPoolsBanner: jest.fn(() => false),
    setHidingPoolsBanner: jest.fn(),
    getHiddenAssets: jest.fn(() => ({})),
    getAutoSelectNodesValue: jest.fn(() => ({})),
    getCustomSort: jest.fn(() => ({})),
    getHiddenWarningNetworks: jest.fn(() => []),
    getAgreeSwapDisclaimer: jest.fn(() => true),
    setHiddenAssets: jest.fn(),
    setSequenceAssets: jest.fn(),
    setCustomSort: jest.fn(),
    getSequenceAssetsByAddress: jest.fn(() => []),
    setHiddenWarningNetwork: jest.fn(),
  },
}));

(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    connect: jest.fn(() => ({
      onDisconnect: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
    })),
  },
};

jest.mock('@/extension/messaging', () => ({
  getPoolsParams: jest.fn(() => Promise.resolve([])),
  subscribePoolsParams: jest.fn(() => Promise.resolve(true)),
}));

import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkJson } from '@extension-base/types';
import type { StatePoolParams } from '@/stores/pools/types';
import { usePoolsStore } from '@/stores/pools';
import { useNetworksStore } from '@/stores/networks';
import { initTestingStores } from '@/stores/setup';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const createAsset = (id: string, overrides: Partial<NetworkJson['assets'][number]> = {}) =>
  ({
    id,
    type: 'normal',
    name: id.toUpperCase(),
    symbol: id.toUpperCase(),
    currencyId: id.toUpperCase(),
    precision: 12,
    priceId: id.toLowerCase(),
    icon: `${id}.svg`,
    color: '#000000',
    staking: 'substrate',
    isUtility: true,
    tonType: 'normal',
    ...overrides,
  }) as NetworkJson['assets'][number];

const createNetwork = (name: string, overrides: Partial<NetworkJson> = {}): NetworkJson =>
  ({
    key: name.toLowerCase(),
    chain: name,
    icon: `${name}.svg`,
    active: true,
    providers: { default: 'wss://example' },
    currentProvider: 'wss://example',
    genesisHash: `0x${name}`,
    ss58Format: 0,
    disabled: false,
    chainId: `0x${name}`,
    name,
    externalApi: {
      staking: undefined,
      history: undefined,
      pricing: undefined,
      explorers: [],
    },
    assets: overrides.assets ?? [createAsset('xor', { name: 'SORA', symbol: 'XOR', icon: 'xor.svg', priceId: 'xor' })],
    customNodes: [],
    nodes: [{ name: 'Default', url: 'wss://example' }],
    addressPrefix: 0,
    ecosystem: 'substrate',
    types: { url: '', name: '' },
    favorite: [],
    ...overrides,
  }) as NetworkJson;

describe('pools store metadata', () => {
  beforeEach(() => {
    initTestingStores();
  });

  it('retains background-sourced metadata for pools assets', () => {
    const poolsStore = usePoolsStore();
    const networksStore = useNetworksStore();

    const soraNetwork = createNetwork(SORA_NETWORK_NAME, {
      assets: [
        createAsset('xor', {
          name: 'SORA',
          symbol: 'XOR',
          icon: 'xor.svg',
          priceId: 'xor',
          color: '#FF0000',
        }),
        createAsset('val', {
          name: 'VAL',
          symbol: 'VAL',
          icon: 'val.svg',
          priceId: 'val',
          color: '#00FF00',
        }),
      ],
    });

    networksStore.setNetworks({ networks: [soraNetwork] });

    const payload: StatePoolParams = {
      poolId: 'xor-val',
      loading: false,
      network: SORA_NETWORK_NAME,
      rewardAsset: 'PSWAP',
      tvl: '100',
      isMyPool: false,
      yourShare: undefined,
      updatedAt: 0,
      asset1: {
        id: 'xor',
        assetId: 'xor',
        symbol: 'XOR',
        name: 'XOR',
        icon: 'xor.svg',
        color: '#FF0000',
        reserve: '50',
        tokenBalance: '5',
        transferableAmount: '3',
        priceId: 'xor',
        totalAmount: '50',
        balanceState: APIItemState.READY,
        decimals: 18,
      },
      asset2: {
        id: 'val',
        assetId: 'val',
        symbol: 'VAL',
        name: 'VAL',
        icon: 'val.svg',
        color: '#00FF00',
        reserve: '45',
        tokenBalance: '4',
        transferableAmount: '2',
        priceId: 'val',
        totalAmount: '45',
        balanceState: APIItemState.READY,
        decimals: 18,
      },
    };

    poolsStore.updatePoolsParams([payload]);

    const [pool] = poolsStore.poolsItems;

    expect(pool).toBeDefined();
    expect(pool.loading).toBe(false);
    expect(pool.asset1.transferableAmount).toBe('3');
    expect(pool.asset1.priceId).toBe('xor');
    expect(pool.asset1.icon).toBe('xor.svg');
    expect(pool.asset2.color).toBe('#00FF00');
    expect(poolsStore.myPoolsItems).toHaveLength(0);
  });
});
