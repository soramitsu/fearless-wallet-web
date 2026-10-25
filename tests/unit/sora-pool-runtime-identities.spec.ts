import { afterEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { PoolsService } from '@extension-base/services/pools-service';
import type State from '@extension-base/background/handlers/State';
import type { RequestAddLiquidity, DemeterMutationRequest } from '@extension-base/services/pools-service/types';
import { api as apiSora, FPNumber, Operation } from '@/sora';
import { XOR, VAL } from '@/sora/runtime';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';

// Load the actual shipped network/asset constants; do not replace registry IDs with runtime IDs in fixtures.
vi.mock('@/consts/global', async (original) => ({
  ...await original<typeof import('@/consts/global')>(), IS_PRODUCTION: true,
}));

const OTHER = `0x${'03'.repeat(32)}`;
const ADDRESS = `0x${'01'.repeat(32)}`;
const UNIT = 10n ** 18n;
const originalApi = apiSora.api;
const originalAccount = apiSora.account;
const originalFees = apiSora.NetworkFee;

afterEach(() => {
  vi.restoreAllMocks();
  apiSora.api = originalApi;
  apiSora.account = originalAccount;
  apiSora.NetworkFee = originalFees;
});

function fixture({ first = VAL, second = OTHER, xorBalance = 10n * UNIT, networkName = SORA_NETWORK_NAME, poolPrecision = 18, rewardPrecision = 18 } = {}) {
  const assets = [XOR, VAL, OTHER].map((address, index) => ({
    address, currencyId: address, id: index === 0 ? SORA_XOR_ASSET_ID : `registry-${index}`,
    symbol: ['XOR', 'VAL', 'OTHER'][index], name: ['XOR', 'VAL', 'OTHER'][index],
    precision: address === VAL ? poolPrecision : address === OTHER ? rewardPrecision : 18,
    decimals: address === VAL ? poolPrecision : address === OTHER ? rewardPrecision : 18,
    isMintable: false, priceId: `price-${index}`,
  }));
  const runtime = {
    isConnected: true,
    isReady: Promise.resolve(true),
    query: {
      assets: { assetInfos: vi.fn(async (address: string) => ({ toHuman: () => {
        const asset = assets.find((item) => item.address === address)!;
        return [asset.symbol, asset.name, asset.precision, false];
      } })) },
      system: { account: vi.fn(async () => ({ data: { free: String(xorBalance), reserved: '0', frozen: '0' } })) },
      tokens: { accounts: vi.fn(async () => ({ free: String(10n * UNIT), reserved: '0', frozen: '0' })) },
    },
  };
  apiSora.api = runtime;
  apiSora.account = { json: null, pair: { address: ADDRESS, meta: {}, isLocked: false } as never };
  const fee = '10000000000000000';
  apiSora.NetworkFee = Object.fromEntries(Object.values(Operation).map((operation) => [operation, fee]));
  vi.spyOn(apiSora, 'calcStaticNetworkFees').mockResolvedValue();
  vi.spyOn(apiSora.poolXyk, 'getReserves').mockResolvedValue([String(100n * UNIT), String(100n * 10n ** BigInt(poolPrecision))]);
  vi.spyOn(apiSora.poolXyk, 'getTotalSupply').mockResolvedValue(String(10n * UNIT));
  vi.spyOn(apiSora.poolXyk, 'getAccountPoolBalanceObservable').mockReturnValue(of(String(5n * UNIT)));
  const accountAsset = vi.spyOn(apiSora.assets, 'getAccountAsset');
  const add = vi.spyOn(apiSora.poolXyk, 'add').mockResolvedValue();
  const remove = vi.spyOn(apiSora.poolXyk, 'remove').mockResolvedValue();
  const state = {
    getAccountAddress: () => ADDRESS,
    keyringService: {
      getAllAccounts: () => [{ address: ADDRESS, meta: { walletSecurityGeneration: 1 } }],
      unlockPair: () => true,
    },
    actionCapabilityService: { isActionEnabled: () => true },
    soraDisclaimerService: { isAccepted: () => true },
    networkService: { networkValues: [{ name: networkName, active: true, assets }] },
    getSubstrateApiMap: { [SORA_NETWORK_NAME]: { api: runtime } },
    soraFees: { value: {}, next: vi.fn() },
    pricesService: { prices: { json: { tokenPriceMap: { 'price-0': 1, 'price-1': 2, 'price-2': 3 } } } },
  } as unknown as State;
  const service = new PoolsService(state);
  vi.spyOn(service, 'getPoolInfo').mockReturnValue({
    asset1: assets.find((asset) => asset.address === first),
    asset2: assets.find((asset) => asset.address === second),
  } as never);
  const request: RequestAddLiquidity = {
    amount1: '1', amount2: '1', assetId1: 'first-registry', assetId2: 'second-registry',
    expectedFee: '0.01', networkName: SORA_NETWORK_NAME, slippage: 0.5, isExchangeB: false, isMobile: false,
  };
  return { service, state, request, accountAsset, add, remove };
}

describe('SORA pool operations distinguish registry identifiers from runtime asset IDs', () => {
  it('preserves the real client boundary between a registry UUID and an on-chain asset ID', async () => {
    fixture();
    expect(SORA_NETWORK_NAME).toBe('sora mainnet');
    await expect(apiSora.assets.getAccountAsset(SORA_XOR_ASSET_ID)).rejects.toThrow('Invalid SORA asset');
    await expect(apiSora.assets.getAccountAsset(XOR)).resolves.toMatchObject({ address: XOR, symbol: 'XOR' });
  });

  it.each(['add', 'remove'] as const)('reads the on-chain XOR balance for a non-XOR pool %s', async (operation) => {
    const { service, request, accountAsset, add, remove } = fixture();
    expect(SORA_XOR_ASSET_ID).not.toBe(XOR);

    await expect(operation === 'add' ? service.addLiquidity(request) : service.removeLiquidity(request))
      .resolves.toEqual({ status: true });
    expect(accountAsset).toHaveBeenCalledWith(XOR);
    expect(accountAsset).not.toHaveBeenCalledWith(SORA_XOR_ASSET_ID);
    expect(operation === 'add' ? add : remove).toHaveBeenCalledOnce();
  });

  it.each(['first', 'second'] as const)('includes the fee when XOR is the %s pool asset', async (side) => {
    const { service, request, add } = fixture({
      first: side === 'first' ? XOR : VAL,
      second: side === 'second' ? XOR : VAL,
      xorBalance: UNIT,
    });
    await expect(service.addLiquidity(request)).resolves.toMatchObject({
      status: false,
      errors: [expect.objectContaining({ message: 'The selected SORA asset balance is insufficient.' })],
    });
    expect(add).not.toHaveBeenCalled();
  });
});

function demeterFixture(networkName = SORA_NETWORK_NAME, poolPrecision = 18, isFarm = true, rewardPrecision = 18) {
  const result = fixture({ networkName, poolPrecision, rewardPrecision });
  const pool = {
    baseAsset: XOR, poolAsset: VAL, rewardAsset: OTHER, isFarm, isCore: false, isRemoved: false,
    multiplier: 1, depositFee: 0, totalTokensInPool: new FPNumber(2), rewards: new FPNumber(1),
    rewardsToBeDistributed: new FPNumber(1),
  };
  vi.spyOn(apiSora.demeterFarming, 'getPoolsObservable').mockResolvedValue(of([pool]));
  vi.spyOn(apiSora.demeterFarming, 'getTokenInfosObservable').mockResolvedValue(of([]));
  vi.spyOn(apiSora.demeterFarming, 'getAccountPoolsObservable').mockReturnValue(of([{
    ...pool, pooledTokens: new FPNumber(2),
  }]));
  const withdraw = vi.spyOn(apiSora.demeterFarming, 'withdrawLiquidity').mockResolvedValue();
  const request: DemeterMutationRequest = {
    operation: 'withdraw', amount: '1', expectedFee: '0.01',
    pool: { key: [XOR, VAL, OTHER, isFarm ? 'farm' : 'stake'].join(':'), isFarm, baseAssetId: XOR, poolAssetId: VAL, rewardAssetId: OTHER },
  };
  return { ...result, pool, withdraw, demeterRequest: request };
}

describe('Demeter catalog and exits use the configured SORA network', () => {
  it.each([0, 6, 18])('values a farm using the %i-decimal pool asset reserve and 18-decimal LP supply', async (precision) => {
    const { service } = demeterFixture(SORA_NETWORK_NAME, precision);
    const result = await service.getDemeterPools();
    expect(result.pools[0].tvl).toBe('80');
  });

  it('preserves fractional LP shares when the reserve asset is indivisible', async () => {
    const { service } = demeterFixture(SORA_NETWORK_NAME, 0);
    vi.mocked(apiSora.poolXyk.getReserves).mockResolvedValue([String(100n * UNIT), '5']);
    const result = await service.getDemeterPools();
    expect(result.pools[0].tvl).toBe('4');
  });

  it('preserves fractional fiat values when valuing an indivisible staking asset', () => {
    const { service, state, pool } = demeterFixture(SORA_NETWORK_NAME, 0, false);
    state.pricesService.prices.json.tokenPriceMap['price-1'] = 0.25;
    pool.totalTokensInPool = new FPNumber(2, 0);
    // The catalog currently filters to farms; exercise the shared non-farm valuation directly.
    expect(Reflect.get(service, 'getDemeterTvl').call(service, pool, VAL, null)).toBe('0.5');
  });

  it.each([0, 6, 18])('preserves weighted fractional emissions in the visible APR for %i-decimal rewards', async (precision) => {
    const { service } = demeterFixture(SORA_NETWORK_NAME, 18, true, precision);
    vi.mocked(apiSora.demeterFarming.getTokenInfosObservable).mockRestore();
    const tokenInfos = Object.assign(async (_asset: string, cb: (value: unknown) => void) => {
      cb({ unwrapOr: () => ({
        tokenPerBlock: String(10n ** BigInt(precision)), farmsTotalMultiplier: 4, stakingTotalMultiplier: 4,
        farmsAllocation: '500000000000000000', stakingAllocation: '250000000000000000',
        teamAllocation: '250000000000000000',
      }) });
      return () => undefined;
    }, { keys: async () => [{ args: [OTHER] }] });
    apiSora.api.query.demeterFarmingPlatform = { tokenInfos };
    const result = await service.getDemeterPools();
    expect(result.pools[0]).toMatchObject({ tokenPerBlock: '1', tvl: '80', apr: '2463750' });
  });

  it('withdraws a non-18-decimal stake using the actual observed position', async () => {
    const { service, demeterRequest } = demeterFixture(SORA_NETWORK_NAME, 6, false);
    vi.mocked(apiSora.demeterFarming.getAccountPoolsObservable).mockRestore();
    apiSora.api.query.demeterFarmingPlatform = {
      userInfos: async (_address: string, cb: (value: unknown) => void) => {
        cb([{ baseAsset: XOR, poolAsset: VAL, rewardAsset: OTHER, isFarm: false, pooledTokens: '2000000', rewards: '0' }]);
        return () => undefined;
      },
    };
    const unstake = vi.spyOn(apiSora.demeterFarming, 'unstake').mockResolvedValue();
    await expect(service.mutateDemeter({ ...demeterRequest, amount: '2' })).resolves.toEqual({ status: true });
    expect(unstake).toHaveBeenCalledWith(expect.objectContaining({ address: VAL, decimals: 6 }),
      expect.objectContaining({ address: OTHER }), '2');
  });

  it.each([SORA_NETWORK_NAME, SORA_NETWORK_NAME.toUpperCase()])('finds assets and prices on %s', async (name) => {
    const { service } = demeterFixture(name);
    const result = await service.getDemeterPools();
    expect(result.available).toBe(true);
    expect(result.pools).toHaveLength(1);
    expect(result.pools[0]).toMatchObject({
      baseAsset: { id: XOR, symbol: 'XOR' }, poolAsset: { id: VAL, symbol: 'VAL' },
      rewardAsset: { id: OTHER, symbol: 'OTHER' }, tvl: '80', pooledTokens: '2',
    });
  });

  it('withdraws an existing position using real asset identities and XOR fee balance', async () => {
    const { service, demeterRequest, withdraw, accountAsset } = demeterFixture();
    await expect(service.mutateDemeter(demeterRequest)).resolves.toEqual({ status: true });
    expect(accountAsset).toHaveBeenCalledWith(XOR);
    expect(accountAsset).not.toHaveBeenCalledWith(SORA_XOR_ASSET_ID);
    expect(withdraw).toHaveBeenCalledWith('1', expect.objectContaining({ address: VAL }),
      expect.objectContaining({ address: OTHER }), expect.objectContaining({ address: XOR }));
  });
});
