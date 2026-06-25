import { fetchHistory } from '@/history/fetchingHistory';
import { getFormattedHistory } from '@/helpers/history';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const MINT = 'So11111111111111111111111111111111111111112';
const OTHER_MINT = '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w';
const SIGNATURE =
  '5Nf8p3dZAbCdEfGhijkLmNoPqRsTuVwXyZ123456789ABCDEFGHJKLMNPQRSTUVWXYZabcd';

function serviceInfo(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: ['wallet-history'],
    chainId: 'solana:mainnet',
    ecosystem: 'solana',
    endpoints: {},
    network: 'mainnet',
    publicBaseUrl: 'https://si.soramitsu.io',
    readOnly: true,
    schemaVersion: 1,
    serviceId: 'si.soramitsu.io',
    serviceName: 'Soramitsu Solana Indexer',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    feeLamports: '5000',
    nativeBalanceChangeLamports: '-1005000',
    programIds: [],
    signature: SIGNATURE,
    slot: 100,
    solswapRoute: null,
    status: 'success',
    timestamp: 1_710_000_000,
    tokenBalanceChanges: [],
    ...overrides,
  };
}

describe('Solana history fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes native SOL transactions from SI', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (input.toString().endsWith('/api/indexer/v1/service-info')) return jsonResponse(serviceInfo());

      return jsonResponse({
        before: null,
        limit: 100,
        nextBefore: null,
        syncedAt: 1,
        total: 2,
        transactions: [transaction(), transaction({ nativeBalanceChangeLamports: '0', signature: `${SIGNATURE}1` })],
        wallet: WALLET,
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://si.soramitsu.io', WALLET, 'solana', 'Solana', 'SOL', true)).resolves.toEqual([
      {
        address: WALLET,
        blockHash: SIGNATURE,
        extrinsicHash: SIGNATURE,
        id: SIGNATURE,
        success: true,
        timestamp: '1710000000',
        transfer: {
          amount: '1005000',
          fee: '5000',
          from: WALLET,
          to: '',
        },
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith('https://si.soramitsu.io/api/indexer/v1/service-info', undefined);
    expect(fetchFn).toHaveBeenCalledWith(`https://si.soramitsu.io/api/indexer/v1/accounts/${WALLET}/txs?limit=100`, undefined);
  });

  it('aggregates matching Solana token deltas and filters unrelated token transactions', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (input.toString().endsWith('/api/indexer/v1/service-info')) return jsonResponse(serviceInfo());

      return jsonResponse({
        before: null,
        limit: 100,
        nextBefore: null,
        syncedAt: 1,
        total: 2,
        transactions: [
          transaction({
            nativeBalanceChangeLamports: '-5000',
            tokenBalanceChanges: [
              { amountDelta: '500', decimals: 6, mint: MINT, postAmount: '500', preAmount: '0', uiAmountDeltaString: '0.0005' },
              { amountDelta: '-200', decimals: 6, mint: MINT, postAmount: '300', preAmount: '500', uiAmountDeltaString: '-0.0002' },
              { amountDelta: '999', decimals: 9, mint: OTHER_MINT, postAmount: '999', preAmount: '0', uiAmountDeltaString: '0.000000999' },
            ],
          }),
          transaction({
            signature: `${SIGNATURE}2`,
            tokenBalanceChanges: [
              { amountDelta: '1', decimals: 9, mint: OTHER_MINT, postAmount: '1', preAmount: '0', uiAmountDeltaString: '0.000000001' },
            ],
          }),
        ],
        wallet: WALLET,
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://si.soramitsu.io', WALLET, 'solana', 'Solana', MINT, false)).resolves.toEqual([
      expect.objectContaining({
        address: WALLET,
        id: SIGNATURE,
        transfer: {
          amount: '300',
          fee: '5000',
          from: '',
          to: WALLET,
        },
      }),
    ]);
  });

  it('rejects Solana history from a misrouted SI service identity before transaction reads', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (input.toString().endsWith('/api/indexer/v1/service-info')) {
        return jsonResponse(serviceInfo({ publicBaseUrl: 'https://ti.soramitsu.io', serviceId: 'ti.soramitsu.io' }));
      }

      throw new Error('transaction endpoint should not be called');
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://si.soramitsu.io', WALLET, 'solana', 'Solana', 'SOL', true)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith('https://si.soramitsu.io/api/indexer/v1/service-info', undefined);
  });

  it('formats Solana history arrays for store pagination shape', () => {
    const formatted = getFormattedHistory(
      [
        {
          address: WALLET,
          id: SIGNATURE,
          success: true,
          timestamp: '1710000000',
          transfer: {
            amount: '1',
            fee: '0',
            from: '',
            to: WALLET,
          },
        },
      ],
      'solana'
    );

    expect(formatted).toMatchObject({
      nodes: [expect.objectContaining({ id: SIGNATURE })],
      pageInfo: { endCursor: '', startCursor: '' },
    });
  });
});
