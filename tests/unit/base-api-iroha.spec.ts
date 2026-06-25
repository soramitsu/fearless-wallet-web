import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import BaseApi from '@/util/BaseApi';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

type Vector = {
  expected: {
    iroha: {
      taira: {
        publicKeyHex: string;
        i105: string;
      };
      nexus: {
        publicKeyHex: string;
        i105: string;
      };
    };
  };
};

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
  vectors: Vector[];
};

const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
const EVM_ADDRESS = '0x0000000000000000000000000000000000000001';
const IROHA_PUBLIC_KEY = fixture.vectors[0].expected.iroha.taira.publicKeyHex;
const TAIRA_ADDRESS = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ADDRESS = fixture.vectors[0].expected.iroha.nexus.i105;

const irohaNetwork = (name: string, chainId: string, chainDiscriminant: number): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [],
    chain: name,
    chainDiscriminant,
    chainId,
    currentProvider: 'torii',
    customNodes: [],
    disabled: false,
    ecosystem: 'iroha',
    favorite: [],
    genesisHash: `0x${chainDiscriminant.toString(16)}`,
    icon: 'iroha',
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

describe('BaseApi Iroha address support', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useNetworksStore } = await import('@/stores/networks');

    useNetworksStore().allNetworks = [
      irohaNetwork(
        'Taira Testnet',
        UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId,
        UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant
      ),
      irohaNetwork(
        'SORA Nexus',
        UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId,
        UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant
      ),
    ];
  });

  it('formats a universal wallet with its Iroha address for Iroha networks', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          irohaAddress: TAIRA_ADDRESS,
          irohaPublicKeyHex: IROHA_PUBLIC_KEY,
        },
        'Taira Testnet'
      )
    ).toBe(TAIRA_ADDRESS);
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
          irohaAddress: TAIRA_ADDRESS,
          irohaPublicKeyHex: IROHA_PUBLIC_KEY,
        },
        'SORA Nexus'
      )
    ).toBe(NEXUS_ADDRESS);
  });

  it('falls back to the base address for Iroha networks without an Iroha address', () => {
    expect(
      BaseApi.formatAddress(
        {
          address: SUBSTRATE_ADDRESS,
          ethereumAddress: EVM_ADDRESS,
        },
        'Taira Testnet'
      )
    ).toBe(SUBSTRATE_ADDRESS);
  });

  it('validates I105 addresses against the selected Iroha network discriminant', () => {
    expect(BaseApi.validateAddress(TAIRA_ADDRESS, 'Taira Testnet')).toBe(true);
    expect(BaseApi.validateAddressByNetwork(TAIRA_ADDRESS, 'Taira Testnet')).toBe(true);
    expect(BaseApi.validateAddress(NEXUS_ADDRESS, 'SORA Nexus')).toBe(true);

    expect(BaseApi.validateAddress(NEXUS_ADDRESS, 'Taira Testnet')).toBe(false);
    expect(BaseApi.validateAddress(TAIRA_ADDRESS, 'SORA Nexus')).toBe(false);
    expect(BaseApi.validateAddress(EVM_ADDRESS, 'Taira Testnet')).toBe(false);
    expect(BaseApi.validateAddress('not-an-i105-address', 'Taira Testnet')).toBe(false);
  });
});
