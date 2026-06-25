import { createPinia, setActivePinia } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import type { Wallet } from '@/stores';
import {
  getTransactionAddress,
  getTransferWalletRecipient,
  isTransferWalletRecipient,
} from '@/helpers/transfers';

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
const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

const wallet: Wallet = {
  address: SUBSTRATE_ADDRESS,
  bitcoinAddress: BITCOIN_MAINNET,
  bitcoinTestnetAddress: BITCOIN_TESTNET,
  ethereumAddress: EVM_ADDRESS,
  solanaAddress: SOLANA_ADDRESS,
};

const network = (name: string, chainId: string, ecosystem: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 42,
    assets: [],
    chain: name,
    chainId,
    currentProvider: ecosystem === 'solana' ? 'rpc' : 'indexer',
    customNodes: [],
    disabled: false,
    ecosystem,
    favorite: [],
    genesisHash: `0x${chainId}`,
    icon: name.toLowerCase(),
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 42,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

describe('transfer wallet recipient formatting', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useNetworksStore } = await import('@/stores/networks');

    useNetworksStore().allNetworks = [
      network('Bitcoin', 'bitcoin:mainnet', 'bitcoin'),
      network('Bitcoin Testnet', 'bitcoin:testnet', 'bitcoin'),
      network('Solana', 'solana:mainnet', 'solana'),
    ];
  });

  it('uses BIP84 receive addresses when selecting a wallet recipient on Bitcoin networks', () => {
    expect(getTransferWalletRecipient(wallet, 'Bitcoin')).toBe(BITCOIN_MAINNET);
    expect(getTransferWalletRecipient(wallet, 'Bitcoin Testnet')).toBe(BITCOIN_TESTNET);

    expect(isTransferWalletRecipient(wallet, BITCOIN_MAINNET, 'Bitcoin')).toBe(true);
    expect(isTransferWalletRecipient(wallet, BITCOIN_TESTNET, 'Bitcoin')).toBe(false);
    expect(isTransferWalletRecipient(wallet, BITCOIN_TESTNET, 'Bitcoin Testnet')).toBe(true);
    expect(isTransferWalletRecipient(wallet, BITCOIN_MAINNET, 'Bitcoin Testnet')).toBe(false);
  });

  it('uses the Solana public key when selecting a wallet recipient on Solana networks', () => {
    expect(getTransferWalletRecipient(wallet, 'Solana')).toBe(SOLANA_ADDRESS);
    expect(isTransferWalletRecipient(wallet, SOLANA_ADDRESS, 'Solana')).toBe(true);
    expect(isTransferWalletRecipient(wallet, SUBSTRATE_ADDRESS, 'Solana')).toBe(false);
  });

  it('keeps transaction source addressing on the stored account key for non-EVM transfer plumbing', () => {
    expect(getTransactionAddress(wallet, 'Bitcoin')).toBe(SUBSTRATE_ADDRESS);
    expect(getTransactionAddress(wallet, 'Bitcoin Testnet')).toBe(SUBSTRATE_ADDRESS);
    expect(getTransactionAddress(wallet, 'Solana')).toBe(SUBSTRATE_ADDRESS);
  });
});
