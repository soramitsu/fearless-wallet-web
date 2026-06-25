import { createPinia, setActivePinia } from 'pinia';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { WalletEcosystem, type HistoryElement } from '@/interfaces';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
const BITCOIN_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const TXID = '11'.repeat(32);

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

const bitcoinNetwork = (): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [
      {
        color: '#f7931a',
        icon: 'bitcoin',
        id: 'BTC',
        isNative: true,
        isUtility: true,
        name: 'Bitcoin',
        precision: 8,
        priceId: 'BTC',
        providers: [],
        staking: '',
        symbol: 'BTC',
        tonType: 'normal',
        type: 'bitcoin',
      },
    ],
    chain: 'Bitcoin',
    chainId: 'bitcoin:mainnet',
    currentProvider: 'indexer',
    customNodes: [],
    disabled: false,
    ecosystem: 'bitcoin',
    externalApi: {
      history: {
        type: 'bitcoin',
        url: 'https://blockstream.info/api',
      },
    },
    favorite: [],
    genesisHash: 'bitcoin:mainnet',
    icon: 'bitcoin',
    key: 'Bitcoin',
    name: 'Bitcoin',
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name: 'Bitcoin', url: '' },
  }) as unknown as NetworkJson;

const btcBalanceGroup = (): TokenGroup =>
  ({
    balances: [
      {
        id: 'BTC',
        isNative: true,
        isUtility: true,
        name: 'Bitcoin',
        precision: 8,
        symbol: 'BTC',
      },
    ],
    groupId: 'BTC',
    icon: 'bitcoin',
    mainNetwork: 'Bitcoin',
    priceId: 'BTC',
    providers: [],
    relayChain: 'bitcoin',
    symbol: 'BTC',
    tokenName: 'BTC',
  }) as unknown as TokenGroup;

const cachedTransaction = (): HistoryElement => ({
  address: BITCOIN_ADDRESS,
  blockHash: TXID,
  extrinsicHash: TXID,
  id: TXID,
  success: true,
  timestamp: '1710000000',
  transfer: {
    amount: '1000',
    fee: '0',
    from: '',
    to: BITCOIN_ADDRESS,
  },
});

describe('Bitcoin history store fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());

    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    accountsStore.selectedWallet = {
      address: SUBSTRATE_ADDRESS,
      bitcoinAddress: BITCOIN_ADDRESS,
      ethereumAddress: '',
      hasEthereum: false,
      isSubstrate: true,
      isTon: false,
      name: 'Universal',
      walletEcosystem: WalletEcosystem.Substrate,
    };
    accountsStore.balances = [btcBalanceGroup()];
    networksStore.allNetworks = [bitcoinNetwork()];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps cached Bitcoin history when Esplora history fetch fails', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const networksStore = useNetworksStore();

    networksStore.setHistory({
      assetId: 'BTC',
      history: [cachedTransaction()],
      networkName: 'bitcoin',
      serviceType: 'bitcoin',
      walletAddress: SUBSTRATE_ADDRESS,
    });

    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));
    vi.stubGlobal('fetch', fetchFn);

    await networksStore.fetchHistory({ assetId: 'BTC', networkName: 'Bitcoin' });

    expect(fetchFn).toHaveBeenCalledWith(`https://blockstream.info/api/address/${BITCOIN_ADDRESS}/txs`);
    expect(networksStore.history.BTC[SUBSTRATE_ADDRESS].bitcoin.nodes).toEqual([cachedTransaction()]);

    info.mockRestore();
  });
});
