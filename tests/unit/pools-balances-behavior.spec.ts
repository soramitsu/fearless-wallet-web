import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { PoolsService } from '@extension-base/services/pools-service';
import type State from '@extension-base/background/handlers/State';
import type { DefaultParams } from '@extension-base/services/pools-service/types';
import { api as apiSora, FPNumber } from '@/sora';
import { XOR, VAL } from '@/sora/runtime';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const codec = (value: number) => new FPNumber(value).toCodecString();
const fp = (value: number) => new FPNumber(value);
const params: DefaultParams = { assetId1: 'xor-registry', assetId2: 'val-registry', amount1: '2', amount2: '4', networkName: SORA_NETWORK_NAME, isExchangeB: false };
let service: PoolsService, state: State;
let updated: Subject<void>, positions: BehaviorSubject<any[]>, locks: BehaviorSubject<any[]>;
let userUnsubscribe: ReturnType<typeof vi.fn>, emit: ReturnType<typeof vi.fn>, cleanups: Map<string, () => void>;
const previousApi = apiSora.api;
beforeEach(() => {
  updated = new Subject(); positions = new BehaviorSubject<any[]>([]); locks = new BehaviorSubject<any[]>([]);
  userUnsubscribe = vi.fn(); emit = vi.fn(); cleanups = new Map();
  vi.spyOn(apiSora.poolXyk, 'getUserPoolsSubscription').mockReturnValue({ unsubscribe: userUnsubscribe } as never);
  vi.spyOn(apiSora.poolXyk, 'updated', 'get').mockReturnValue(updated as never);
  vi.spyOn(apiSora.demeterFarming, 'getAccountPoolsObservable').mockReturnValue(positions);
  vi.spyOn(apiSora.ceresLiquidityLocker, 'getLockerDataObservable').mockReturnValue(locks);
  vi.spyOn(apiSora.poolXyk, 'getReserves').mockResolvedValue([codec(200), codec(400)]);
  vi.spyOn(apiSora.poolXyk, 'getTotalSupply').mockResolvedValue(codec(100));
  const assets = [{ id: 'xor-registry', currencyId: XOR, symbol: 'XOR', name: 'XOR', precision: 18 }, { id: 'val-registry', currencyId: VAL, symbol: 'VAL', name: 'VAL', precision: 18 }];
  state = {
    getCurrentAddress: () => 'alice',
    getSubstrateApiMap: { [SORA_NETWORK_NAME]: { api: { isReady: Promise.resolve(true) } } },
    networkService: { getNetworkJson: () => ({ assets, ecosystem: 'substrate', chainId: 'sora' }) },
    pricesService: { getTokenPrice: () => fp(3) },
    balanceService: { getTokenBalance: (_address: string, id: string) => { const asset = assets.find(asset => asset.id === id)!; return { groupId: `${id}-group`, balances: [{ ...asset, name: SORA_NETWORK_NAME }] }; } },
    subscriptionService: { createSubscription: () => emit, setUnsubscriptionHandle: (id: string, cleanup: () => void) => cleanups.set(id, cleanup), cancelSubscription: (id: string) => cleanups.get(id)?.() },
  } as unknown as State;
  service = new PoolsService(state);
  service.accountLiquidity = [{ firstAddress: XOR, secondAddress: VAL, balance: codec(10), totalSupply: codec(100), reserveA: codec(200), reserveB: codec(400), firstBalance: codec(20), secondBalance: codec(40), poolShare: '10' }] as never;
});
afterEach(() => { service.unsubscribePools(); vi.restoreAllMocks(); apiSora.api = previousApi; });

describe('pool balances and share calculations', () => {
  it('resolves registry assets to their exact on-chain identities and decimal balances', () => {
    const info = service.getPoolInfo(params);
    expect(info.asset1).toMatchObject({ address: XOR, decimals: 18, symbol: 'XOR' }); expect(info.asset2.address).toBe(VAL);
    expect(info.firstBalance.valueFP.toString()).toBe('20'); expect(info.secondBalance.valueFP.toString()).toBe('40');
    expect(service.getLiquidityBalance(params).toString()).toBe('10');
    expect(service.getPoolAmountValue(params)).toBe('4'); expect(service.getPoolAmountValue({ ...params, isExchangeB: true })).toBe('2');
    expect(service.getRemoved(params)).toBe('1');
    const balances = service.getTokensBalance(params); expect(balances.firstTokenBalance.toString()).toBe('20'); expect(balances.secondTokenBalance.toString()).toBe('40');
  });
  it('uses the largest farm lock, sums matching Ceres locks, and clamps locks to the account balance', () => {
    service.demeterAccountPools = [
      { baseAsset: XOR, poolAsset: VAL, isFarm: true, pooledTokens: fp(3) },
      { baseAsset: XOR, poolAsset: VAL, isFarm: true, pooledTokens: fp(4) },
      { baseAsset: XOR, poolAsset: VAL, isFarm: false, pooledTokens: fp(99) },
      { baseAsset: VAL, poolAsset: XOR, isFarm: true, pooledTokens: fp(99) },
    ] as never;
    service.ceresLockedPools = [{ assetA: XOR, assetB: VAL, poolTokens: fp(2) }, { assetA: XOR, assetB: VAL, poolTokens: fp(3) }, { assetA: VAL, assetB: XOR, poolTokens: fp(99) }] as never;
    const info = service.getPoolInfo(params);
    expect(service.getDemeterLockedBalance(info).toString()).toBe('4'); expect(service.getCeresLockedBalance(info).toString()).toBe('5'); expect(service.getLiquidityBalance(params).toString()).toBe('5');
    const balances = service.getTokensBalance(params); expect(balances.firstTokenBalance.toString()).toBe('10'); expect(balances.secondTokenBalance.toString()).toBe('20');
    service.ceresLockedPools.push({ assetA: XOR, assetB: VAL, poolTokens: fp(100) } as never);
    expect(service.getLiquidityBalance(params).toString()).toBe('0');
  });
  it('converts requested underlying tokens to the same pool-token amount even when some liquidity is locked', () => {
    service.demeterAccountPools = [{ baseAsset: XOR, poolAsset: VAL, isFarm: true, pooledTokens: fp(4) }] as never;
    expect(service.getRemoved(params)).toBe('1');
    expect(service.getRemoved({ ...params, isExchangeB: true })).toBe('1');
  });
  it('returns finite zero amounts when the account has no liquidity', () => {
    service.accountLiquidity = [];
    expect(service.getPoolInfo(params).balance).toBe('0');
    expect(service.getPoolAmountValue(params)).toBe('0'); expect(service.getRemoved(params)).toBe('0');
    const balances = service.getTokensBalance(params); expect(balances.firstTokenBalance.toString()).toBe('0'); expect(balances.secondTokenBalance.toString()).toBe('0');
    expect(service.getShareOfPoolByRemoveLiquidity({ ...params, type: 'removeLiquidity' })).toBe('0');
  });
  it('calculates remaining pool share after partial and complete removal', () => {
    expect(service.getShareOfPoolByRemoveLiquidity({ ...params, type: 'removeLiquidity' })).toBe(fp(9).div(fp(99)).mul(fp(100)).toString());
    expect(service.getShareOfPoolByRemoveLiquidity({ ...params, amount1: '20', amount2: '40', type: 'removeLiquidity' })).toBe('0');
    service.accountLiquidity[0].totalSupply = codec(10);
    expect(service.getShareOfPoolByRemoveLiquidity({ ...params, amount1: '20', amount2: '40', type: 'removeLiquidity' })).toBe('0');
  });
  it('estimates new pool tokens and includes existing holdings in the resulting share', async () => {
    vi.spyOn(apiSora.poolXyk, 'estimatePoolTokensMinted').mockReturnValue([codec(2), '0', '0']);
    expect((await service.getMinted(service.getPoolInfo(params), codec(100))).toString()).toBe('2');
    expect(await service.getShareOfPoolByAddLiquidity({ ...params, type: 'addLiquidity' })).toBe(fp(12).div(fp(102)).mul(fp(100)).toLocaleString());
    expect(apiSora.poolXyk.estimatePoolTokensMinted).toHaveBeenCalledWith(expect.objectContaining({ address: XOR }), expect.objectContaining({ address: VAL }), '2', '4', codec(200), codec(400), codec(100));
  });
  it('reports 100% ownership for the first funded pool and 0% for an empty contribution', async () => {
    vi.mocked(apiSora.poolXyk.getTotalSupply).mockResolvedValue('0');
    expect(await service.getShareOfPoolByAddLiquidity({ ...params, type: 'addLiquidity' })).toBe('100');
    expect(await service.getShareOfPoolByAddLiquidity({ ...params, amount1: '0', type: 'addLiquidity' })).toBe('0');
  });
  it('provides zero display reserves and supply when unavailable', async () => {
    vi.mocked(apiSora.poolXyk.getReserves).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(apiSora.poolXyk.getTotalSupply).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));
    for (let i = 0; i < 2; i++) { expect(await service.getReserves(XOR, VAL)).toEqual(['0', '0']); expect(await service.getTotalSupply(XOR, VAL)).toBe('0'); }
  });
  it('rejects unsupported operations without invoking a transaction', async () => {
    expect(await service.makePool({ params, type: 'unknown' } as never)).toMatchObject({ status: false, errors: [expect.objectContaining({ message: '[POOLS] unknown operation' })] });
  });
});

describe('pool subscription and catalog lifecycle', () => {
  it('starts each shared subscription once, propagates updates, and cleans all sources', async () => {
    vi.spyOn(service, 'getAllReserves').mockResolvedValue([]);
    await service.getPoolsParams({ networks: [SORA_NETWORK_NAME, 'unknown'] });
    await service.getPoolsParams({ networks: [SORA_NETWORK_NAME] });
    expect(apiSora.poolXyk.getUserPoolsSubscription).toHaveBeenCalledOnce(); expect(apiSora.demeterFarming.getAccountPoolsObservable).toHaveBeenCalledOnce();
    expect(service.getAllReserves).toHaveBeenCalledTimes(2);
    const listeners: (() => void)[] = [];
    await service.accountLiquiditySubscribe('page', { onDisconnect: { addListener: (fn: () => void) => listeners.push(fn) } } as never);
    expect(emit).toHaveBeenCalledWith([]);
    vi.spyOn(apiSora.poolXyk, 'accountLiquidity', 'get').mockReturnValue(service.accountLiquidity);
    updated.next(); expect(emit).toHaveBeenLastCalledWith(service.accountLiquidity);
    positions.next([{ pooledTokens: fp(3) }]); locks.next([{ poolTokens: fp(1) }]);
    expect(service.demeterAccountPools[0].pooledTokens.toString()).toBe('3'); expect(service.ceresLockedPools[0].poolTokens.toString()).toBe('1');
    listeners.forEach(fn => fn()); emit.mockClear(); updated.next(); expect(emit).not.toHaveBeenCalled();
    service.unsubscribePools(); expect(userUnsubscribe).toHaveBeenCalledOnce(); expect(updated.observed).toBe(false); expect(positions.observed).toBe(false); expect(locks.observed).toBe(false);
    expect(service.userPoolsSubscription).toBeNull();
  });
  it('drops cached positions when disconnecting so another account never sees stale liquidity', async () => {
    await service.accountLiquiditySubscribe('page');
    service.unsubscribePools();
    expect(service.accountLiquidity).toEqual([]); expect(service.demeterAccountPools).toEqual([]); expect(service.ceresLockedPools).toEqual([]);
    expect(emit).toHaveBeenLastCalledWith([]);
  });
  it('omits malformed and unknown-asset reserves but preserves exact pool identities', async () => {
    const key = (asset: string) => ({ code: { toString: () => asset } });
    const entry = (first: string, second: string, reserves: unknown[]) => [{ args: [key(first), key(second)] }, reserves];
    // u128 codec objects carry decimals in their type metadata; use the installed registry to match RPC data.
    const { TypeRegistry } = await import('@polkadot/types'); const registry = new TypeRegistry();
    const reserves = [registry.createType('Balance', codec(200)), registry.createType('Balance', codec(400))];
    apiSora.api = { query: { poolXYK: { reserves: { entries: vi.fn(async () => [entry(XOR, VAL, reserves), entry(XOR, VAL, []), entry(XOR, 'unknown', reserves)]) } } } } as never;
    vi.spyOn(apiSora.dex, 'baseAssetsIds', 'get').mockReturnValue([XOR]);
    const result = await service.getAllReserves(SORA_NETWORK_NAME, 'alice');
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ isMyPool: true, yourShare: '10', asset1: { id: 'xor-registry-group', name: 'XOR', tokenBalance: '20' }, asset2: { id: 'val-registry-group', name: 'VAL', tokenBalance: '40' } });
    expect(result[0].asset1.assetKey).not.toBe(result[0].asset2.assetKey);
  });
});
