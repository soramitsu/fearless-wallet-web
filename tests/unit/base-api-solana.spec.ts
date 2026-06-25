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
const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

const solanaNetwork = {
  active: true,
  addressPrefix: 0,
  assets: [],
  chain: 'Solana',
  chainId: 'solana:mainnet',
  currentProvider: 'rpc',
  customNodes: [],
  disabled: false,
  ecosystem: 'solana',
  favorite: [],
  genesisHash: '0xsolana-mainnet',
  icon: 'solana',
  key: 'Solana',
  name: 'Solana',
  nodes: [],
  providers: {},
  ss58Format: 0,
  types: { name: 'Solana', url: '' },
} as unknown as NetworkJson;

describe('BaseApi Solana address support', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useNetworksStore } = await import('@/stores/networks');

    useNetworksStore().allNetworks = [solanaNetwork];
  });

  it('formats a universal wallet with its Solana address for Solana networks', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          solanaAddress: SOLANA_ADDRESS,
        },
        'Solana'
      )
    ).toBe(SOLANA_ADDRESS);
  });

  it('falls back to the base address for Solana networks without a Solana address', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
        },
        'Solana'
      )
    ).toBe(SUBSTRATE_ADDRESS);
  });

  it('validates Solana public keys without accepting EVM or invalid base58 addresses', () => {
    expect(BaseApi.validateAddress(SOLANA_ADDRESS, 'Solana')).toBe(true);
    expect(BaseApi.validateAddressByNetwork(SOLANA_ADDRESS, 'Solana')).toBe(true);
    expect(BaseApi.validateAddress(EVM_ADDRESS, 'Solana')).toBe(false);
    expect(BaseApi.validateAddress('not-a-solana-public-key', 'Solana')).toBe(false);
  });
});
