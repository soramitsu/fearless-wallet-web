import { combineLatest, defer, map, of, Subject, switchMap, type Observable, type Subscription } from 'rxjs';
import { FPNumber } from './number';
import { amount, codec, observe, slippageFactor, text, unwrap, XOR, type Runtime } from './runtime';
import type { SoraClient } from './client';
import type { AccountLiquidity, AccountLockedPool, Asset, DemeterAccountPool, DemeterPool, DemeterRewardToken } from './types';

const flag = (value: Runtime) => value === true || value?.isTrue === true;
const decimal = (value: Runtime, precision = 18) => FPNumber.fromCodecValue(codec(value), precision);
const MIN_LIQUIDITY = 1000n;

export function poolWithdrawal(marker: string, reserve: string, supply: string): string {
  const owned = BigInt(codec(marker));
  const total = BigInt(codec(supply));
  if (total <= 0n || owned > total) throw new Error('Invalid pool share');
  return String(BigInt(codec(reserve)) * owned / (owned === total ? total : total + MIN_LIQUIDITY));
}
export function poolMarkerForAmount(requested: string, reserve: string, supply: string, owned: string): string {
  const wanted = BigInt(codec(requested));
  const balance = BigInt(codec(reserve));
  const total = BigInt(codec(supply));
  if (wanted <= 0n || wanted > BigInt(poolWithdrawal(owned, reserve, supply))) throw new Error('Withdrawal exceeds the available pool position');
  if (wanted === balance && BigInt(owned) === total) return supply;
  // Round the required burn upwards by at most one LP atom.
  const marker = (wanted * (total + MIN_LIQUIDITY) + balance - 1n) / balance;
  // The runtime releases its minimum-liquidity reserve only on a full burn.
  // A partial amount near that discontinuity may be impossible to represent;
  // never silently turn it into a withdrawal of the entire position.
  if (marker >= total || marker > BigInt(owned))
    throw new Error('This partial withdrawal cannot be represented. Choose a smaller amount or review a full withdrawal.');
  return String(marker);
}

export class SoraPools {
  accountLiquidity: AccountLiquidity[] = [];
  updated = new Subject<void>();
  constructor(private root: SoraClient) {}
  private async assetPrecisions(addresses: string[], expectedApi: Runtime): Promise<Map<string, number>> {
    if (this.root.api !== expectedApi) throw new Error('SORA connection changed; refresh farming balances');
    const entries = await Promise.all([...new Set(addresses)].map(async (address) =>
      [address, (await this.root.assets.getAssetInfo(address)).decimals] as const,
    ));
    if (this.root.api !== expectedApi) throw new Error('SORA connection changed; refresh farming balances');
    return new Map(entries);
  }
  private async poolAddress(a: string, b: string): Promise<string> {
    const properties = unwrap(await this.root.api.query.poolXYK.properties(a, b));
    if (!properties?.[0]) throw new Error('SORA pool is unavailable');
    return String(properties[0]);
  }
  async getReserves(a: string, b: string): Promise<[string, string]> {
    const reserves = await this.root.api.query.poolXYK.reserves(a, b);
    return [codec(reserves[0]), codec(reserves[1])];
  }
  async getTotalSupply(a: string, b: string): Promise<string> {
    return codec(unwrap(await this.root.api.query.poolXYK.totalIssuances(await this.poolAddress(a, b))));
  }
  getAccountPoolBalanceObservable(a: string, b: string): Observable<string> {
    const address = this.root.address;
    return defer(() => this.poolAddress(a, b)).pipe(switchMap((pool) => observe(
      (cb) => this.root.api.query.poolXYK.poolProviders(pool, address, cb),
      (value) => codec(unwrap(value)),
    )));
  }
  private heads() {
    return observe((cb) => this.root.api.rpc.chain.subscribeNewHeads(cb), () => undefined);
  }
  getUserPoolsSubscription(): Subscription {
    const address = this.root.address;
    return this.heads().pipe(switchMap(async () => {
      const bases = this.root.dex.baseAssetsIds;
      const targets = await this.root.api.query.poolXYK.accountPools.multi(bases.map((base) => [address, base]));
      const pairs: [string, string][] = targets.flatMap((values: Runtime, i: number) => [...values].map((value) => [bases[i], text(value)]));
      return Promise.all(pairs.map(async ([a, b]): Promise<AccountLiquidity> => {
        const pool = await this.poolAddress(a, b);
        const [reserves, supply, balance, first, second] = await Promise.all([
          this.getReserves(a, b), this.getTotalSupply(a, b),
          this.root.api.query.poolXYK.poolProviders(pool, address).then((value: Runtime) => codec(unwrap(value))),
          this.root.assets.getAssetInfo(a), this.root.assets.getAssetInfo(b),
        ]);
        const total = BigInt(supply);
        return {
          address: pool, balance, firstAddress: a, secondAddress: b,
          firstBalance: total ? poolWithdrawal(balance, reserves[0], supply) : '0',
          secondBalance: total ? poolWithdrawal(balance, reserves[1], supply) : '0',
          reserveA: reserves[0], reserveB: reserves[1], totalSupply: supply,
          poolShare: total ? new FPNumber(balance).div(supply).mul(100).toString() : '0',
          decimals: first.decimals, decimals2: second.decimals, symbol: `${first.symbol}-${second.symbol}`, name: `${first.symbol}-${second.symbol} pool`,
        };
      }));
    })).subscribe({
      next: (positions) => { if (this.root.address === address) { this.accountLiquidity = positions; this.updated.next(); } },
      error: () => { this.accountLiquidity = []; this.updated.next(); },
    });
  }
  estimatePoolTokensMinted(a: Asset, b: Asset, valueA: string, valueB: string, reserveA: string, reserveB: string, supply: string): string[] {
    const inputA = new FPNumber(amount(valueA, a.decimals));
    const inputB = new FPNumber(amount(valueB, b.decimals));
    if (BigInt(reserveA) === 0n && BigInt(reserveB) === 0n) {
      return [inputA.mul(inputB).sqrt().sub(1000).max(FPNumber.ZERO).value.toFixed(0, 1)];
    }
    if (BigInt(reserveA) <= 0n || BigInt(reserveB) <= 0n || BigInt(supply) <= 0n) throw new Error('Invalid pool reserves');
    return [FPNumber.min(inputA.mul(String(BigInt(supply) + MIN_LIQUIDITY)).div(reserveA), inputB.mul(String(BigInt(supply) + MIN_LIQUIDITY)).div(reserveB))!.value.toFixed(0, 1), supply];
  }
  private arrange(a: Asset, b: Asset, valueA: string, valueB: string): [Asset, Asset, string, string, number] {
    const ids = this.root.dex.ids;
    if (ids.has(a.address)) return [a, b, valueA, valueB, ids.get(a.address)!];
    if (ids.has(b.address)) return [b, a, valueB, valueA, ids.get(b.address)!];
    throw new Error('The pool has no registered SORA base asset');
  }
  async add(a: Asset, b: Asset, valueA: string, valueB: string, tolerance: string | number): Promise<void> {
    const [first, second, x, y, dex] = this.arrange(a, b, valueA, valueB);
    const factor = FPNumber.ONE.sub(slippageFactor(tolerance));
    const minA = new FPNumber(x, first.decimals).mul(factor).toCodecString();
    const minB = new FPNumber(y, second.decimals).mul(factor).toCodecString();
    await this.root.submit(this.root.api.tx.poolXYK.depositLiquidity(dex, first.address, second.address, amount(x, first.decimals), amount(y, second.decimals), minA, minB));
  }
  async remove(a: Asset, b: Asset, liquidity: string, reserveA: string, reserveB: string, supply: string, tolerance: string | number): Promise<void> {
    if (BigInt(codec(supply)) <= 0n) throw new Error('Pool supply is zero');
    const marker = BigInt(amount(liquidity));
    const total = BigInt(supply);
    if (marker > total) throw new Error('Withdrawal exceeds pool supply');
    // Divide last in integer space: a tiny share must not round to zero before
    // multiplication by the reserves, which would erase the slippage bound.
    const scale = 10n ** 18n;
    const factor = BigInt(FPNumber.ONE.sub(slippageFactor(tolerance)).toCodecString());
    const minA = String(BigInt(poolWithdrawal(String(marker), reserveA, supply)) * factor / scale);
    const minB = String(BigInt(poolWithdrawal(String(marker), reserveB, supply)) * factor / scale);
    const [first, second, x, y, dex] = this.arrange(a, b, minA, minB);
    await this.root.submit(this.root.api.tx.poolXYK.withdrawLiquidity(dex, first.address, second.address, amount(liquidity), x, y));
  }
  farming = {
    getAccountPoolsObservable: (): Observable<DemeterAccountPool[]> => {
      const expectedApi = this.root.api;
      const address = this.root.address;
      return observe(
        (cb) => expectedApi.query.demeterFarmingPlatform.userInfos(address, cb),
        (values) => [...values],
      ).pipe(switchMap(async (values): Promise<DemeterAccountPool[]> => {
        const precisions = await this.assetPrecisions(values.flatMap((value) => [
          text(value.rewardAsset), ...(flag(value.isFarm) ? [] : [text(value.poolAsset)]),
        ]), expectedApi);
        if (this.root.address !== address) throw new Error('SORA account changed; refresh farming balances');
        return values.map((value) => ({
          isFarm: flag(value.isFarm), baseAsset: text(value.baseAsset), poolAsset: text(value.poolAsset),
          rewardAsset: text(value.rewardAsset),
          // Farm positions are LP markers; staking positions are raw pool-asset atoms.
          pooledTokens: decimal(value.pooledTokens, flag(value.isFarm) ? 18 : precisions.get(text(value.poolAsset))!),
          rewards: decimal(value.rewards, precisions.get(text(value.rewardAsset))!),
        }));
      }));
    },
    getPoolsObservable: async (): Promise<Observable<DemeterPool[]>> => {
      const expectedApi = this.root.api;
      const query = expectedApi.query.demeterFarmingPlatform.pools;
      const keys = await query.keys();
      if (!keys.length) return of([]);
      const precisions = await this.assetPrecisions(keys.flatMap((key: Runtime) => key.args.map(text)), expectedApi);
      return combineLatest(keys.map((key: Runtime) => observe(
        (cb) => query(...key.args, cb),
        (values) => [...values].map((value): DemeterPool => ({
          baseAsset: text(value.baseAsset), poolAsset: text(key.args[0]), rewardAsset: text(key.args[1]),
          multiplier: Number(value.multiplier), isCore: flag(value.isCore), isFarm: flag(value.isFarm), isRemoved: flag(value.isRemoved),
          depositFee: decimal(value.depositFee).toNumber(),
          totalTokensInPool: decimal(value.totalTokensInPool, flag(value.isFarm) ? 18 : precisions.get(text(key.args[0]))!),
          rewards: decimal(value.rewards, precisions.get(text(key.args[1]))!),
          rewardsToBeDistributed: decimal(value.rewardsToBeDistributed, precisions.get(text(key.args[1]))!),
        })),
      ))).pipe(map((values: DemeterPool[][]) => values.flat()));
    },
    getTokenInfosObservable: async (): Promise<Observable<DemeterRewardToken[]>> => {
      const expectedApi = this.root.api;
      const query = expectedApi.query.demeterFarmingPlatform.tokenInfos;
      const keys: Runtime[] = await query.keys();
      if (!keys.length) return of([]);
      const precisions = await this.assetPrecisions(keys.map((key: Runtime) => text(key.args[0])), expectedApi);
      return combineLatest(keys.map((key: Runtime) => observe((cb) => query(...key.args, cb), (option) => {
        const value = unwrap(option);
        if (!value) throw new Error('Missing farming token configuration');
        return { assetId: text(key.args[0]), tokenPerBlock: decimal(value.tokenPerBlock, precisions.get(text(key.args[0]))!), farmsTotalMultiplier: Number(value.farmsTotalMultiplier), stakingTotalMultiplier: Number(value.stakingTotalMultiplier), farmsAllocation: decimal(value.farmsAllocation), stakingAllocation: decimal(value.stakingAllocation), teamAllocation: decimal(value.teamAllocation) };
      })));
    },
    depositLiquidity: (value: string, pool: Asset, reward: Asset, base: Asset) => this.root.submit(this.root.api.tx.demeterFarmingPlatform.deposit(base.address, pool.address, reward.address, true, amount(value))),
    withdrawLiquidity: (value: string, pool: Asset, reward: Asset, base: Asset) => this.root.submit(this.root.api.tx.demeterFarmingPlatform.withdraw(base.address, pool.address, reward.address, amount(value), true)),
    stake: (asset: Asset, reward: Asset, value: string) => this.root.submit(this.root.api.tx.demeterFarmingPlatform.deposit(asset.address, asset.address, reward.address, false, amount(value, asset.decimals))),
    unstake: (asset: Asset, reward: Asset, value: string) => this.root.submit(this.root.api.tx.demeterFarmingPlatform.withdraw(asset.address, asset.address, reward.address, amount(value, asset.decimals), false)),
    getRewards: (farm: boolean, asset: Asset, reward: Asset, base?: Asset, _value?: string) => this.root.submit(this.root.api.tx.demeterFarmingPlatform.getRewards(base?.address ?? (farm ? XOR : asset.address), asset.address, reward.address, farm)),
  };
  locker = {
    getLockerDataObservable: (): Observable<AccountLockedPool[]> => observe(
      (cb) => this.root.api.query.ceresLiquidityLocker.lockerData(this.root.address, cb),
      (values) => [...values].map((value) => ({ poolTokens: decimal(value.poolTokens), unlockingTimestamp: Number(value.unlockingTimestamp), assetA: text(value.assetA), assetB: text(value.assetB) })).filter((value) => value.unlockingTimestamp >= Date.now()),
    ),
  };
}
