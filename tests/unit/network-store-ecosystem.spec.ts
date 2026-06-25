import { createPinia, setActivePinia } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { WalletEcosystem } from '@/interfaces';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const network = (name: string, ecosystem: NetworkJson['ecosystem'], rank = 1): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [],
    chain: name,
    chainId: `${ecosystem}:${name.toLowerCase()}`,
    currentProvider: 'default',
    customNodes: [],
    disabled: false,
    ecosystem,
    favorite: name === 'Bitcoin' ? ['bitcoin-wallet'] : [],
    genesisHash: `0x${name.toLowerCase()}`,
    icon: name.toLowerCase(),
    key: name,
    name,
    nodes: [],
    providers: {},
    rank,
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

describe('network store ecosystem filtering', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());

    useNetworksStore().allNetworks = [
      network('Bitcoin', 'bitcoin'),
      network('Polkadot', 'substrate'),
      network('Ethereum', 'ethereum'),
      network('Solana', 'solana'),
      network('TON', 'ton'),
      network('Taira', 'iroha'),
    ];
  });

  it('shows only Bitcoin networks for Bitcoin wallets', () => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    accountsStore.selectedWallet = {
      address: 'bitcoin-wallet',
      bitcoinAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      ethereumAddress: '',
      name: 'Bitcoin',
      walletEcosystem: WalletEcosystem.Bitcoin,
      isSubstrate: false,
      isTon: false,
      hasEthereum: false,
    };

    expect(networksStore.networks.map(({ name }) => name)).toEqual(['Bitcoin']);
    expect(networksStore.activeNetworkForSelectedWallet.map(({ name }) => name)).toEqual(['Bitcoin']);
  });

  it('does not leak single-ecosystem networks into Substrate/EVM wallets', () => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    accountsStore.selectedWallet = {
      address: 'substrate-wallet',
      ethereumAddress: '0x0000000000000000000000000000000000000001',
      name: 'Universal',
      walletEcosystem: WalletEcosystem.Substrate,
      isSubstrate: true,
      isTon: false,
      hasEthereum: true,
    };

    expect(networksStore.networks.map(({ name }) => name)).toEqual(['Polkadot', 'Ethereum']);
    expect(networksStore.activeNetworkForSelectedWallet.map(({ name }) => name)).toEqual(['Polkadot', 'Ethereum']);
  });

  it('shows only Solana networks for Solana wallets', () => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    accountsStore.selectedWallet = {
      address: 'solana-wallet',
      ethereumAddress: '',
      solanaAddress: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
      name: 'Solana',
      walletEcosystem: WalletEcosystem.Solana,
      isSubstrate: false,
      isTon: false,
      hasEthereum: false,
    };

    expect(networksStore.networks.map(({ name }) => name)).toEqual(['Solana']);
    expect(networksStore.activeNetworkForSelectedWallet.map(({ name }) => name)).toEqual(['Solana']);
  });

  it('shows only Iroha networks for Iroha wallets', () => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    accountsStore.selectedWallet = {
      address: 'iroha-wallet',
      ethereumAddress: '',
      irohaAddress: 'testu\uff9b1Pc\uff852\uff97t\uff89a\uff98L\uff95\uff7d2M\u30f1\uff90\uff8e\uff73\uff93\u30f1\uff77\uff86\uff72M\uff92S\uff8f\uff71\u30f1\uff77J\u30f1FmJ\uff87Ms6YN687Y',
      name: 'Iroha',
      walletEcosystem: WalletEcosystem.Iroha,
      isSubstrate: false,
      isTon: false,
      hasEthereum: false,
    };

    expect(networksStore.networks.map(({ name }) => name)).toEqual(['Taira']);
    expect(networksStore.activeNetworkForSelectedWallet.map(({ name }) => name)).toEqual(['Taira']);
  });
});
