import { APIItemState } from '@extension-base/api/types/networks';
import SolanaBalanceService from '@extension-base/services/balance-service/SolanaBalanceService';
import type {
  SolanaTokenBalance,
  SolanaTokenMetadata,
  SolanaWalletBalancesResponse,
} from '@extension-base/services/solana-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';

const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const SUBSTRATE_ADDRESS = 'substrate-address';
const SPL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_2022_MINT = '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w';

const solanaNetwork = {
  active: true,
  addressPrefix: 0,
  assets: [
    {
      color: '#14f195',
      icon: 'solana',
      id: 'SOL',
      isNative: true,
      isUtility: true,
      name: 'Solana',
      precision: 9,
      providers: [],
      staking: '',
      symbol: 'SOL',
      tonType: 'normal',
      type: 'solana',
    },
  ],
  chain: 'Solana',
  chainId: 'solana-mainnet',
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

const balancesResponse = (
  lamports: string,
  uiAmountString: string,
  tokens: SolanaTokenBalance[] = []
): SolanaWalletBalancesResponse => ({
  native: {
    decimals: 9,
    lamports,
    type: 'native',
    mint: 'SOL',
    uiAmountString,
  },
  syncedAt: 1,
  tokens,
  total: 1,
  wallet: WALLET,
});

const tokenBalance = (
  mint: string,
  uiAmountString: string,
  decimals: number,
  program: SolanaTokenBalance['program']
): SolanaTokenBalance => ({
  accountAddress: `${mint.slice(0, 8)}TokenAccount111111111111111111111`,
  amount: uiAmountString.replace('.', ''),
  decimals,
  delegatedAmount: null,
  isNative: false,
  mint,
  owner: WALLET,
  program,
  programId: program === 'token-2022' ? 'TokenzQdY00000000000000000000000000000000000' : 'Tokenkeg000000000000000000000000000000000000',
  rentExemptReserve: null,
  state: 'initialized',
  type: 'token',
  uiAmountString,
});

const tokenMetadata = (
  mint: string,
  symbol: string,
  name: string,
  program: SolanaTokenMetadata['program'],
  overrides: Partial<SolanaTokenMetadata> = {}
): SolanaTokenMetadata => ({
  decimals: 6,
  exists: true,
  extensions: [],
  freezeAuthority: null,
  isInitialized: true,
  mint,
  mintAuthority: null,
  name,
  program,
  programId: null,
  supply: '100000000',
  syncedAt: 1,
  symbol,
  transferFeeConfig: null,
  transferHook: null,
  uiSupplyString: '100',
  uri: null,
  ...overrides,
});

const createState = () => {
  const updateBalanceStore = vi.fn();
  const publishBalance = vi.fn();
  const state = {
    balanceService: {
      balanceMap: {},
      publishBalance,
      updateBalanceStore,
    },
    networkService: {
      activeNetworkByEcosystem: {
        solana: [solanaNetwork],
      },
      networkMap: {
        Solana: solanaNetwork,
      },
    },
    timeoutService: {
      lazyNext: (_key: string, callback: () => void) => callback(),
    },
  } as unknown as State;

  return { publishBalance, state, updateBalanceStore };
};

describe('SolanaBalanceService', () => {
  it('fetches SOL from SI and updates the local balance map', async () => {
    const { publishBalance, state, updateBalanceStore } = createState();
    const client = {
      getBalances: vi.fn().mockResolvedValue(balancesResponse('1234567890', '1.23456789')),
      verifyServiceInfo: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        serviceId: 'si.soramitsu.io',
      }),
    };
    const service = new SolanaBalanceService(state, client);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['solana'],
      })
    ).resolves.toEqual([{ assetId: 'SOL', balance: '1.23456789', network: 'Solana' }]);

    expect(client.verifyServiceInfo).toHaveBeenCalledTimes(1);
    expect(client.getBalances).toHaveBeenCalledWith(WALLET);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      free: '1.23456789',
      state: APIItemState.READY,
      symbol: 'SOL',
      type: 'solana',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ total: '1.23456789' }),
      SUBSTRATE_ADDRESS
    );
    expect(publishBalance).toHaveBeenCalled();

    await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      solanaAddress: WALLET,
      networks: ['solana'],
    });

    expect(client.verifyServiceInfo).toHaveBeenCalledTimes(1);
  });

  it('marks Solana balance errored when SI service identity verification fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { state, updateBalanceStore } = createState();
    const client = {
      getBalances: vi.fn(),
      verifyServiceInfo: vi.fn().mockRejectedValue(new Error('unexpected_service_info')),
    };
    const service = new SolanaBalanceService(state, client);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['Solana'],
      })
    ).resolves.toEqual([{ assetId: 'SOL', balance: '0', network: 'Solana' }]);

    expect(client.getBalances).not.toHaveBeenCalled();
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      total: '0',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ state: APIItemState.ERROR, total: '0' }),
      SUBSTRATE_ADDRESS
    );

    warn.mockRestore();
  });

  it('normalizes SPL and Token-2022 balances into token groups with SI metadata', async () => {
    const { state, updateBalanceStore } = createState();
    const spl = tokenBalance(SPL_MINT, '12.5', 6, 'spl-token');
    const token2022 = tokenBalance(TOKEN_2022_MINT, '3.000000001', 9, 'token-2022');
    const client = {
      getBalances: vi.fn().mockResolvedValue(balancesResponse('2500000000', '2.5', [spl, token2022])),
      getTokenMetadataBatch: vi.fn().mockResolvedValue({
        syncedAt: 1,
        tokens: [
          tokenMetadata(SPL_MINT, 'USDC', 'USD Coin', 'spl-token'),
          tokenMetadata(TOKEN_2022_MINT, 'T22', 'Token 2022 Asset', 'token-2022', {
            extensions: ['transferFeeConfig', 'transferHook'],
            transferFeeConfig: {
              newerTransferFee: {
                epoch: '42',
                maximumFee: '1000',
                transferFeeBasisPoints: 25,
              },
              olderTransferFee: null,
              transferFeeConfigAuthority: null,
              withheldAmount: '0',
              withdrawWithheldAuthority: null,
            },
            transferHook: {
              authority: null,
              extraAccountMetasAddress: 'ExtraMeta111111111111111111111111111111',
              programId: 'Hook1111111111111111111111111111111111111',
            },
          }),
        ],
        total: 2,
      }),
    };
    const service = new SolanaBalanceService(state, client);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['Solana'],
      })
    ).resolves.toEqual([
      { assetId: 'SOL', balance: '2.5', network: 'Solana' },
      { assetId: SPL_MINT, balance: '12.5', network: 'Solana' },
      { assetId: TOKEN_2022_MINT, balance: '3.000000001', network: 'Solana' },
    ]);

    expect(client.getTokenMetadataBatch).toHaveBeenCalledWith([SPL_MINT, TOKEN_2022_MINT]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: SPL_MINT,
          symbol: 'USDC',
          tokenName: 'USD Coin',
          balances: [
            expect.objectContaining({
              precision: 6,
              solanaTokenAccountAddress: spl.accountAddress,
              solanaTokenExtensions: [],
              solanaTokenMint: SPL_MINT,
              solanaTokenProgram: 'spl-token',
              solanaTokenProgramId: spl.programId,
              solanaTokenState: 'initialized',
              solanaTokenTransferFeeConfig: null,
              solanaTokenTransferHook: null,
              symbol: 'USDC',
              transferable: '12.5',
            }),
          ],
        }),
        expect.objectContaining({
          groupId: TOKEN_2022_MINT,
          symbol: 'T22',
          tokenName: 'Token 2022 Asset',
          balances: [
            expect.objectContaining({
              precision: 9,
              solanaTokenAccountAddress: token2022.accountAddress,
              solanaTokenExtensions: ['transferFeeConfig', 'transferHook'],
              solanaTokenMint: TOKEN_2022_MINT,
              solanaTokenProgram: 'token-2022',
              solanaTokenProgramId: token2022.programId,
              solanaTokenState: 'initialized',
              solanaTokenTransferFeeConfig: expect.objectContaining({
                newerTransferFee: expect.objectContaining({ transferFeeBasisPoints: 25 }),
              }),
              solanaTokenTransferHook: expect.objectContaining({
                extraAccountMetasAddress: 'ExtraMeta111111111111111111111111111111',
              }),
              symbol: 'T22',
              transferable: '3.000000001',
            }),
          ],
        }),
      ])
    );
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ id: SPL_MINT, total: '12.5' }),
      SUBSTRATE_ADDRESS
    );
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ id: TOKEN_2022_MINT, total: '3.000000001' }),
      SUBSTRATE_ADDRESS
    );
  });

  it('keeps token balances available when SI metadata lookup fails', async () => {
    const { state } = createState();
    const client = {
      getBalances: vi
        .fn()
        .mockResolvedValue(balancesResponse('1', '0.000000001', [tokenBalance(SPL_MINT, '7', 6, 'spl-token')])),
      getTokenMetadataBatch: vi.fn().mockRejectedValue(new Error('metadata unavailable')),
    };
    const service = new SolanaBalanceService(state, client);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['Solana'],
      })
    ).resolves.toEqual([
      { assetId: 'SOL', balance: '0.000000001', network: 'Solana' },
      { assetId: SPL_MINT, balance: '7', network: 'Solana' },
    ]);

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: SPL_MINT,
          symbol: 'So11...1112',
          tokenName: SPL_MINT,
          balances: [
            expect.objectContaining({
              solanaTokenAccountAddress: expect.any(String),
              solanaTokenExtensions: [],
              solanaTokenMint: SPL_MINT,
              solanaTokenProgram: 'spl-token',
              state: APIItemState.READY,
              total: '7',
            }),
          ],
        }),
      ])
    );
  });

  it('does not merge a token that uses the SOL display symbol into the native SOL group', async () => {
    const { state } = createState();
    const client = {
      getBalances: vi.fn().mockResolvedValue(balancesResponse('1000000000', '1', [tokenBalance(SPL_MINT, '4', 9, 'spl-token')])),
      getTokenMetadataBatch: vi.fn().mockResolvedValue({
        syncedAt: 1,
        tokens: [tokenMetadata(SPL_MINT, 'SOL', 'Wrapped SOL', 'spl-token')],
        total: 1,
      }),
    };
    const service = new SolanaBalanceService(state, client);

    await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      solanaAddress: WALLET,
      networks: ['Solana'],
    });

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: 'SOL',
          balances: [expect.objectContaining({ id: 'SOL', isNative: true, total: '1' })],
        }),
        expect.objectContaining({
          groupId: SPL_MINT,
          tokenName: 'Wrapped SOL',
          balances: [
            expect.objectContaining({
              id: SPL_MINT,
              isNative: false,
              solanaTokenMint: SPL_MINT,
              solanaTokenProgram: 'spl-token',
              total: '4',
            }),
          ],
        }),
      ])
    );
  });

  it('marks native SOL errored when SI balance lookup fails', async () => {
    const { state } = createState();
    const client = {
      getBalances: vi.fn().mockRejectedValue(new Error('SI unavailable')),
    };
    const service = new SolanaBalanceService(state, client);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['Solana'],
      })
    ).resolves.toEqual([{ assetId: 'SOL', balance: '0', network: 'Solana' }]);

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      symbol: 'SOL',
      total: '0',
    });
  });

  it('keeps cached Solana native and token balances visible when SI balance lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { state, updateBalanceStore } = createState();
    const spl = tokenBalance(SPL_MINT, '12.5', 6, 'spl-token');
    const client = {
      getBalances: vi
        .fn()
        .mockResolvedValueOnce(balancesResponse('2500000000', '2.5', [spl]))
        .mockRejectedValueOnce(new Error('SI unavailable')),
      getTokenMetadataBatch: vi.fn().mockResolvedValue({
        syncedAt: 1,
        tokens: [tokenMetadata(SPL_MINT, 'USDC', 'USD Coin', 'spl-token')],
        total: 1,
      }),
      verifyServiceInfo: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        serviceId: 'si.soramitsu.io',
      }),
    };
    const service = new SolanaBalanceService(state, client);

    await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      solanaAddress: WALLET,
      networks: ['Solana'],
    });

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        solanaAddress: WALLET,
        networks: ['Solana'],
      })
    ).resolves.toEqual([
      { assetId: 'SOL', balance: '2.5', network: 'Solana' },
      { assetId: SPL_MINT, balance: '12.5', network: 'Solana' },
    ]);

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: 'SOL',
          balances: [expect.objectContaining({ state: APIItemState.ERROR, total: '2.5' })],
        }),
        expect.objectContaining({
          groupId: SPL_MINT,
          balances: [expect.objectContaining({ state: APIItemState.ERROR, total: '12.5' })],
        }),
      ])
    );
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ id: 'SOL', state: APIItemState.ERROR, total: '2.5' }),
      SUBSTRATE_ADDRESS
    );
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Solana',
      expect.objectContaining({ id: SPL_MINT, state: APIItemState.ERROR, total: '12.5' }),
      SUBSTRATE_ADDRESS
    );

    warn.mockRestore();
  });
});
