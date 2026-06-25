import { createPinia, setActivePinia } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import BaseApi from '@/util/BaseApi';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
const EVM_ADDRESS = '0x0000000000000000000000000000000000000001';
const BITCOIN_MAINNET = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const BITCOIN_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

const bitcoinNetwork = (name: string, chainId: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [],
    chain: name,
    chainId,
    currentProvider: 'indexer',
    customNodes: [],
    disabled: false,
    ecosystem: 'bitcoin',
    favorite: [],
    genesisHash: `0x${chainId}`,
    icon: 'bitcoin',
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

describe('BaseApi Bitcoin address support', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useNetworksStore } = await import('@/stores/networks');

    useNetworksStore().allNetworks = [
      bitcoinNetwork('Bitcoin', 'bitcoin:mainnet'),
      bitcoinNetwork('Bitcoin Testnet', 'bitcoin:testnet'),
    ];
  });

  it('formats a universal wallet with its Bitcoin address for Bitcoin networks', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          bitcoinAddress: BITCOIN_MAINNET,
          bitcoinTestnetAddress: BITCOIN_TESTNET,
        },
        'Bitcoin'
      )
    ).toBe(BITCOIN_MAINNET);

    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          bitcoinAddress: BITCOIN_MAINNET,
          bitcoinTestnetAddress: BITCOIN_TESTNET,
        },
        'Bitcoin Testnet'
      )
    ).toBe(BITCOIN_TESTNET);
  });

  it('falls back to the base address for Bitcoin networks without a Bitcoin address', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
        },
        'Bitcoin'
      )
    ).toBe(SUBSTRATE_ADDRESS);

    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          bitcoinAddress: BITCOIN_MAINNET,
        },
        'Bitcoin Testnet'
      )
    ).toBe(SUBSTRATE_ADDRESS);
  });

  it('validates Bitcoin addresses against the selected Bitcoin network', () => {
    expect(BaseApi.validateAddress(BITCOIN_MAINNET, 'Bitcoin')).toBe(true);
    expect(BaseApi.validateAddressByNetwork(BITCOIN_MAINNET, 'Bitcoin')).toBe(true);
    expect(BaseApi.validateAddress(BITCOIN_TESTNET, 'Bitcoin Testnet')).toBe(true);

    expect(BaseApi.validateAddress(BITCOIN_TESTNET, 'Bitcoin')).toBe(false);
    expect(BaseApi.validateAddress(BITCOIN_MAINNET, 'Bitcoin Testnet')).toBe(false);
    expect(BaseApi.validateAddress(EVM_ADDRESS, 'Bitcoin')).toBe(false);
    expect(BaseApi.validateAddress('not-a-bitcoin-address', 'Bitcoin')).toBe(false);
  });
});
