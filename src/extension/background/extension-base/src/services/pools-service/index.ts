import { api as apiSora, type CodecString, FPNumber, Operation } from '@sora-substrate/util';
import {
  BasicTxErrorCode,
  TransferErrorCode,
  type BasicTxResponse,
  type Port,
} from '@extension-base/background/types/types';
import { type u128 } from '@polkadot/types';
import { type AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import { BehaviorSubject } from 'rxjs';
import {
  type DemeterAccountPool,
  type DemeterPool,
  type DemeterRewardToken,
} from '@sora-substrate/util/build/demeterFarming/types';
import { type AccountLockedPool } from '@sora-substrate/util/build/ceresLiquidityLocker/types';
import type {
  GetShareOfPoolRequest,
  RequestAddLiquidity,
  PoolsParamsResponse,
  MakePoolsRequest,
  RequestRemoveLiquidity,
  PoolsParamsRequest,
  DefaultPoolsParams,
  DefaultParams,
  DemeterMutationRequest,
  DemeterOperation,
  DemeterPoolAsset,
  DemeterPoolsResponse,
} from './types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import type { AccountAsset, Asset } from '@sora-substrate/util/src/assets/types';
import { getSoraAsset } from '@/extension/background/extension-base/src/api/substrate/sora';
import { isSameString } from '@/helpers';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';
import {
  isCapturedSoraPairStillSelected,
  isLocallySignableSelectedSoraPair,
  type SoraPairBinding,
} from '@/defi/soraAccountBinding';
import { createAssetKey } from '@/portfolio/assetIdentity';

const toReserve = (value: u128): string => new FPNumber(value).toString();
const toKey = (address: { code: { toString(): string } }) => address.code.toString();
type SubscriptionLike = { unsubscribe(): void };
type FirstValueObservable<T> = {
  subscribe(next: (value: T) => void, error?: (reason: unknown) => void): SubscriptionLike;
};
type DemeterPoolLiquidity = { poolReserve: string; totalSupply: string };
type SoraSigningContext = {
  pair: SoraPairBinding;
  selectedAddress: string;
};
type PreparedLiquidityMutation = {
  signingContext: SoraSigningContext;
  asset1: AccountAsset;
  asset2: AccountAsset;
  xorAsset: AccountAsset;
  fee: FPNumber;
  reserves: [CodecString, CodecString];
  totalSupply: CodecString;
  poolBalance: CodecString;
};
type LiquidityPreparation =
  | { ok: true; value: PreparedLiquidityMutation }
  | { ok: false; response: BasicTxResponse };

const getSvgUrl = (assetName: string): string =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/${assetName.toUpperCase()}.svg`;

const formatSoraAddress = (address: string): string => apiSora.formatAddress(address);

interface LiquidityInfo {
  supply: string;
  balance: string;
  asset1: Asset;
  asset2: Asset;
  amount1: string;
  amount2: string;
  reserveA: string;
  reserveB: string;
  firstBalance: {
    value: string;
    valueFP: FPNumber;
  };
  secondBalance: {
    value: string;
    valueFP: FPNumber;
  };
}

export class PoolsService {
  private readonly accountLiquiditySubject: BehaviorSubject<AccountLiquidity[]> = new BehaviorSubject<
    AccountLiquidity[]
  >([]);

  userPoolsSubscription: SubscriptionLike | null = null;
  liquidityUpdatedSubscription: SubscriptionLike | null = null;
  demeterFarmingSubscription: SubscriptionLike | null = null;
  ceresLiquidityLockerSubscription: SubscriptionLike | null = null;

  accountLiquidity: AccountLiquidity[] = [];
  demeterAccountPools: DemeterAccountPool[] = [];
  ceresLockedPools: AccountLockedPool[] = [];

  constructor(private state: State) {}

  private getSoraPair(): SoraPairBinding | undefined {
    return (apiSora as unknown as { account?: { pair?: SoraPairBinding } }).account?.pair;
  }

  private captureSoraSigningContext(): SoraSigningContext | null {
    const selectedAddress = (() => {
      try {
        return this.state.getAccountAddress();
      } catch {
        return '';
      }
    })();
    const pair = this.getSoraPair();

    if (!pair || !isLocallySignableSelectedSoraPair(pair, selectedAddress, formatSoraAddress)) return null;

    return { pair, selectedAddress };
  }

  private isSigningContextCurrent(context: SoraSigningContext): boolean {
    const selectedAddress = (() => {
      try {
        return this.state.getAccountAddress();
      } catch {
        return '';
      }
    })();

    return isCapturedSoraPairStillSelected(context.pair, this.getSoraPair(), selectedAddress, formatSoraAddress);
  }

  public getLiquiditySigningCapability(): { available: boolean; reason?: string; address?: string } {
    const context = this.captureSoraSigningContext();

    if (!context) {
      return { available: false, reason: 'A locally signable SORA account is required.' };
    }

    return { available: true, address: context.selectedAddress };
  }

  private async isSoraRuntimeReady(networkName: string = SORA_NETWORK_NAME): Promise<boolean> {
    if (!isSameString(networkName, SORA_NETWORK_NAME)) return false;

    try {
      const network = this.state.networkService.networkValues.find(({ name }) => isSameString(name, SORA_NETWORK_NAME));
      const apiProps = this.state.getSubstrateApiMap[SORA_NETWORK_NAME];

      return Boolean(
        network?.active &&
          !network.disabled &&
          (await apiProps?.api?.isReady) &&
          apiSora.connected
      );
    } catch {
      return false;
    }
  }

  private async refreshSoraFee(operation: Operation): Promise<FPNumber | null> {
    try {
      await apiSora.calcStaticNetworkFees();
      const rawFee = apiSora.NetworkFee[operation];
      const fee = FPNumber.fromCodecValue(rawFee);

      if (!fee.isFinity() || !fee.isGreaterThan(FPNumber.ZERO)) return null;
      this.state.soraFees.next({ ...this.state.soraFees.value, [operation]: fee.toString() });

      return fee;
    } catch {
      return null;
    }
  }

  public async getPoolsParams(params: PoolsParamsRequest): Promise<PoolsParamsResponse> {
    const { networks } = params;

    if (this.userPoolsSubscription === null) {
      this.userPoolsSubscription = apiSora.poolXyk.getUserPoolsSubscription();

      this.liquidityUpdatedSubscription = apiSora.poolXyk.updated.subscribe(() => {
        this.accountLiquidity = apiSora.poolXyk.accountLiquidity;
        this.accountLiquiditySubject.next(this.accountLiquidity);

        console.info('accountLiquidity subscription: ', this.accountLiquidity);
      });
    }

    if (this.demeterFarmingSubscription === null) {
      this.demeterFarmingSubscription = apiSora.demeterFarming.getAccountPoolsObservable().subscribe((accountPools) => {
        this.demeterAccountPools = accountPools;

        console.info('demeterAccountPools subscription: ', this.demeterAccountPools);
      });
    }

    if (this.ceresLiquidityLockerSubscription === null) {
      this.ceresLiquidityLockerSubscription = apiSora.ceresLiquidityLocker
        .getLockerDataObservable()
        .subscribe((data) => {
          this.ceresLockedPools = data;

          console.info('ceresLockedPools subscription: ', this.ceresLockedPools);
        });
    }

    // TODO use networks
    const promises: Promise<DefaultPoolsParams[]>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network.toLowerCase()];
      const isReady = await apiProps?.api?.isReady;

      if (!isReady) return [];

      const address = this.state.getCurrentAddress(network);
      const allReserves = await this.getAllReserves(network, address);

      return allReserves;
    });

    return (await Promise.all(promises)).flat();
  }

  public async accountLiquiditySubscribe(id: string, port?: Port): Promise<boolean> {
    const cb = this.state.subscriptionService.createSubscription<'pri(pools.accountLiquidity)'>(id, port);

    const accountLiquiditySubscription = this.accountLiquiditySubject.subscribe((accountLiquidity) =>
      cb(accountLiquidity)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, accountLiquiditySubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return true;
  }

  public unsubscribePools(): void {
    this.userPoolsSubscription?.unsubscribe();
    this.liquidityUpdatedSubscription?.unsubscribe();
    this.demeterFarmingSubscription?.unsubscribe();
    this.ceresLiquidityLockerSubscription?.unsubscribe();

    this.userPoolsSubscription = null;
    this.liquidityUpdatedSubscription = null;
    this.demeterFarmingSubscription = null;
    this.ceresLiquidityLockerSubscription = null;
  }

  public async getDemeterPools(): Promise<DemeterPoolsResponse> {
    const fees = this.getDemeterFees();
    const signing = this.getDemeterSigningCapability();
    const module = apiSora.demeterFarming;

    if (
      !module ||
      typeof module.getPoolsObservable !== 'function' ||
      typeof module.getTokenInfosObservable !== 'function'
    ) {
      return {
        available: false,
        reason: 'Demeter farming is not available in the connected SORA runtime.',
        canSign: signing.available,
        signReason: signing.reason,
        fees,
        pools: [],
      };
    }

    try {
      const [poolsObservable, tokensObservable] = await Promise.all([
        module.getPoolsObservable(),
        module.getTokenInfosObservable(),
      ]);
      const [pools, tokens] = await Promise.all([
        poolsObservable
          ? this.getFirstObservableValue(poolsObservable as unknown as FirstValueObservable<DemeterPool[]>)
          : Promise.resolve([] as DemeterPool[]),
        tokensObservable
          ? this.getFirstObservableValue(tokensObservable as unknown as FirstValueObservable<DemeterRewardToken[]>)
          : Promise.resolve([] as DemeterRewardToken[]),
      ]);
      let accountPools: DemeterAccountPool[] = [];

      if (signing.available) {
        try {
          accountPools = await this.getFirstObservableValue(
            module.getAccountPoolsObservable() as unknown as FirstValueObservable<DemeterAccountPool[]>
          );
          this.demeterAccountPools = accountPools;
        } catch (error) {
          console.warn('Unable to load Demeter positions', error);
        }
      }

      const tokenByAsset = new Map(tokens.map((token) => [token.assetId, token]));
      const positionsByPool = new Map(
        accountPools.map((pool) => [this.getDemeterPoolKey(pool), pool])
      );
      const visiblePools = pools.filter(
        (pool) => pool.isFarm && (!pool.isRemoved || positionsByPool.has(this.getDemeterPoolKey(pool)))
      );
      const result = (await Promise.all(
        visiblePools.map(async (pool) =>
          this.serializeDemeterPool(
            pool,
            tokenByAsset.get(pool.rewardAsset),
            positionsByPool.get(this.getDemeterPoolKey(pool)),
            await this.getDemeterPoolLiquidity(pool)
          )
        )
      ))
        .filter((pool): pool is NonNullable<typeof pool> => Boolean(pool))
        .sort((left, right) => {
          const positionDiff = Number(right.pooledTokens !== '0') - Number(left.pooledTokens !== '0');
          return positionDiff || left.poolAsset.symbol.localeCompare(right.poolAsset.symbol) || left.key.localeCompare(right.key);
        });

      return {
        available: true,
        canSign: signing.available,
        signReason: signing.reason,
        fees,
        pools: result,
      };
    } catch (error) {
      console.warn('Unable to load Demeter farming catalog', error);

      return {
        available: false,
        reason: 'The Demeter catalog is temporarily unavailable. Existing positions are preserved on-chain.',
        canSign: signing.available,
        signReason: signing.reason,
        fees,
        pools: [],
      };
    }
  }

  public async mutateDemeter(request: DemeterMutationRequest): Promise<BasicTxResponse> {
    if (!this.state.actionCapabilityService?.isActionEnabled('demeter')) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Demeter actions are temporarily unavailable.' }],
      };
    }
    if (!this.state.soraDisclaimerService?.isAccepted()) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Accept the Polkaswap risk disclaimer first.' }],
      };
    }

    const signingContext = this.captureSoraSigningContext();

    if (!signingContext) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'A locally signable SORA account is required.' }],
      };
    }
    if (!(await this.isSoraRuntimeReady())) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'The SORA runtime is unavailable.' }],
      };
    }
    if (!(['deposit', 'withdraw', 'claim'] as const).includes(request.operation)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'Unsupported Demeter action.' }],
      };
    }
    if (request.operation !== 'claim' && !this.isPositiveDecimal(request.amount)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'Enter a positive decimal amount.' }],
      };
    }

    try {
      const operation = {
        deposit: Operation.DemeterFarmingDepositLiquidity,
        withdraw: Operation.DemeterFarmingWithdrawLiquidity,
        claim: Operation.DemeterFarmingGetRewards,
      }[request.operation];
      const fee = await this.refreshSoraFee(operation);

      if (!fee || fee.toString() !== request.expectedFee) {
        return {
          status: false,
          errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'The SORA network fee changed. Review and confirm again.' }],
        };
      }
      const pool = await this.getAuthoritativeDemeterPool(request);
      if (!pool) {
        return {
          status: false,
          errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'The selected Demeter pool is not available.' }],
        };
      }
      const positions = await this.getAuthoritativeDemeterPositions();
      const position = positions.find((item) => this.getDemeterPoolKey(item) === request.pool.key);

      if (request.operation === 'deposit' && pool.isRemoved) {
        return {
          status: false,
          errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'This Demeter pool is closed for deposits.' }],
        };
      }
      if (request.operation === 'withdraw') {
        if (!position || position.pooledTokens.isZero()) {
          return {
            status: false,
            errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'There is no position to withdraw.' }],
          };
        }
        if (new FPNumber(request.amount!).isGreaterThan(position.pooledTokens)) {
          return {
            status: false,
            errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'The amount exceeds the deposited position.' }],
          };
        }
      }
      if (request.operation === 'claim' && (!position || position.rewards.isZero())) {
        return {
          status: false,
          errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'There are no rewards to claim.' }],
        };
      }

      const baseAsset = this.getDemeterAsset(request.pool.baseAssetId);
      const poolAsset = this.getDemeterAsset(request.pool.poolAssetId);
      const rewardAsset = this.getDemeterAsset(request.pool.rewardAssetId);
      const xorAsset = await apiSora.assets.getAccountAsset(SORA_XOR_ASSET_ID);

      if (!isSameString(xorAsset.address, SORA_XOR_ASSET_ID)) {
        throw new Error('The authoritative XOR balance could not be verified.');
      }
      const xorAvailable = FPNumber.fromCodecValue(xorAsset.balance.transferable, xorAsset.decimals);
      let xorRequired = fee;

      if (request.operation === 'deposit') {
        const amount = new FPNumber(request.amount!);

        if (request.pool.isFarm) {
          const poolBalance = await this.getFirstObservableValue(
            apiSora.poolXyk.getAccountPoolBalanceObservable(baseAsset.address, poolAsset.address) as unknown as FirstValueObservable<string | null>
          );
          const available = FPNumber.fromCodecValue(poolBalance ?? '0');

          if (amount.isGreaterThan(available)) {
            return {
              status: false,
              errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The available pool-token balance is insufficient.' }],
            };
          }
        } else {
          const accountAsset = await apiSora.assets.getAccountAsset(poolAsset.address);

          if (!isSameString(accountAsset.address, poolAsset.address)) {
            throw new Error('The selected staking asset could not be verified.');
          }
          const available = FPNumber.fromCodecValue(accountAsset.balance.transferable, accountAsset.decimals);

          if (isSameString(poolAsset.address, SORA_XOR_ASSET_ID)) xorRequired = xorRequired.add(amount);
          else if (amount.isGreaterThan(available)) {
            return {
              status: false,
              errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The selected asset balance is insufficient.' }],
            };
          }
        }
      }

      if (xorAvailable.lt(xorRequired)) {
        return {
          status: false,
          errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'Add enough XOR to cover the action and current SORA fee.' }],
        };
      }

      const runtimeReady = await this.isSoraRuntimeReady();
      if (
        !runtimeReady ||
        !this.state.actionCapabilityService?.isActionEnabled('demeter') ||
        !this.state.soraDisclaimerService?.isAccepted() ||
        !this.isSigningContextCurrent(signingContext)
      ) {
        return {
          status: false,
          errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'The SORA account or runtime changed. Review the action again.' }],
        };
      }

      if (
        !this.state.keyringService.unlockPair(signingContext.selectedAddress) ||
        !this.state.actionCapabilityService?.isActionEnabled('demeter') ||
        !this.state.soraDisclaimerService?.isAccepted() ||
        !this.isSigningContextCurrent(signingContext)
      ) {
        return {
          status: false,
          errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Unlock the selected SORA account and try again.' }],
        };
      }
      apiSora.shouldPairBeLocked = false;

      if (request.operation === 'deposit') {
        if (request.pool.isFarm) {
          await apiSora.demeterFarming.depositLiquidity(request.amount!, poolAsset, rewardAsset, baseAsset);
        } else {
          await apiSora.demeterFarming.stake(poolAsset, rewardAsset, request.amount!);
        }
      } else if (request.operation === 'withdraw') {
        if (request.pool.isFarm) {
          await apiSora.demeterFarming.withdrawLiquidity(request.amount!, poolAsset, rewardAsset, baseAsset);
        } else {
          await apiSora.demeterFarming.unstake(poolAsset, rewardAsset, request.amount!);
        }
      } else {
        await apiSora.demeterFarming.getRewards(
          request.pool.isFarm,
          poolAsset,
          rewardAsset,
          baseAsset,
          position?.rewards.toString()
        );
      }

      return { status: true };
    } catch (error) {
      return {
        status: false,
        errors: [{ message: `[DEMETER] ${String(error)}`, code: TransferErrorCode.TRANSFER_ERROR }],
      };
    }
  }

  private async getAuthoritativeDemeterPool(request: DemeterMutationRequest): Promise<DemeterPool | undefined> {
    const expectedKey = [
      request.pool.baseAssetId,
      request.pool.poolAssetId,
      request.pool.rewardAssetId,
      request.pool.isFarm ? 'farm' : 'stake',
    ].join(':');

    if (request.pool.key !== expectedKey) return undefined;
    const observable = await apiSora.demeterFarming.getPoolsObservable();
    if (!observable) return undefined;
    const pools = await this.getFirstObservableValue(
      observable as unknown as FirstValueObservable<DemeterPool[]>
    );

    return pools.find((pool) => this.getDemeterPoolKey(pool) === expectedKey);
  }

  private async getAuthoritativeDemeterPositions(): Promise<DemeterAccountPool[]> {
    const positions = await this.getFirstObservableValue(
      apiSora.demeterFarming.getAccountPoolsObservable() as unknown as FirstValueObservable<DemeterAccountPool[]>
    );
    this.demeterAccountPools = positions;
    return positions;
  }

  private getDemeterFees(): Record<DemeterOperation, string> {
    const fees = this.state.soraFees.value as Record<string, string>;

    return {
      deposit: fees[Operation.DemeterFarmingDepositLiquidity] ?? '0',
      withdraw: fees[Operation.DemeterFarmingWithdrawLiquidity] ?? '0',
      claim: fees[Operation.DemeterFarmingGetRewards] ?? '0',
    };
  }

  private getFirstObservableValue<T>(observable: FirstValueObservable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // It must exist before subscribing because some observable implementations
      // synchronously invoke the callback during subscribe().
      let subscription: SubscriptionLike | undefined;
      // eslint-disable-next-line prefer-const
      subscription = observable.subscribe(
        (value) => {
          resolve(value);
          Promise.resolve().then(() => subscription?.unsubscribe());
        },
        reject
      );
    });
  }

  public getDemeterSigningCapability(): { available: boolean; reason?: string } {
    return this.getLiquiditySigningCapability();
  }

  private serializeDemeterPool(
    pool: DemeterPool,
    token: DemeterRewardToken | undefined,
    position: DemeterAccountPool | undefined,
    liquidity: DemeterPoolLiquidity | null
  ) {
    const baseAsset = this.getDemeterPoolAsset(pool.baseAsset);
    const poolAsset = this.getDemeterPoolAsset(pool.poolAsset);
    const rewardAsset = this.getDemeterPoolAsset(pool.rewardAsset);

    if (!baseAsset || !poolAsset || !rewardAsset) return null;

    const tvl = this.getDemeterTvl(pool, poolAsset.id, liquidity);
    const apr = this.getDemeterApr(pool, token, rewardAsset.id, tvl);

    return {
      key: this.getDemeterPoolKey(pool),
      baseAsset,
      poolAsset,
      rewardAsset,
      isFarm: pool.isFarm,
      isCore: pool.isCore,
      isRemoved: pool.isRemoved,
      multiplier: String(pool.multiplier),
      depositFee: String(pool.depositFee),
      totalTokensInPool: pool.totalTokensInPool.toString(),
      rewards: pool.rewards.toString(),
      rewardsToBeDistributed: pool.rewardsToBeDistributed.toString(),
      tokenPerBlock: token?.tokenPerBlock.toString() ?? null,
      tvl,
      apr,
      pooledTokens: position?.pooledTokens.toString() ?? '0',
      earnedRewards: position?.rewards.toString() ?? '0',
    };
  }

  private getDemeterPoolKey(pool: Pick<DemeterPool, 'baseAsset' | 'poolAsset' | 'rewardAsset' | 'isFarm'>): string {
    return [pool.baseAsset, pool.poolAsset, pool.rewardAsset, pool.isFarm ? 'farm' : 'stake'].join(':');
  }

  private getDemeterPoolAsset(assetId: string): DemeterPoolAsset | null {
    const network = this.state.networkService.networkValues.find(({ name }) => isSameString(name, 'Sora'));
    const asset = network?.assets.find(({ currencyId, id }) => currencyId === assetId || id === assetId);

    if (!asset) return null;

    return {
      id: assetId,
      symbol: asset.symbol,
      precision: asset.precision,
      icon: asset.icon,
    };
  }

  private getDemeterAsset(assetId: string): Asset {
    const asset = this.getDemeterPoolAsset(assetId);

    if (!asset) throw new Error(`Unsupported SORA asset ${assetId}`);

    return {
      address: asset.id,
      symbol: asset.symbol,
      name: asset.symbol,
      decimals: asset.precision,
      isMintable: true,
    };
  }

  private async getDemeterPoolLiquidity(pool: DemeterPool): Promise<DemeterPoolLiquidity | null> {
    if (!pool.isFarm) return null;
    const [reserves, totalSupply] = await Promise.all([
      this.getReserves(pool.baseAsset, pool.poolAsset),
      this.getTotalSupply(pool.baseAsset, pool.poolAsset),
    ]);

    if (!reserves?.[1] || totalSupply === '0') return null;
    return { poolReserve: reserves[1], totalSupply };
  }

  private getDemeterTvl(
    pool: DemeterPool,
    poolAssetId: string,
    liquidity: DemeterPoolLiquidity | null
  ): string | null {
    const price = this.getDemeterPrice(poolAssetId);
    if (price === null) return null;
    if (pool.isFarm) {
      if (!liquidity) return null;
      const supply = FPNumber.fromCodecValue(liquidity.totalSupply);
      if (supply.isZero()) return null;

      return FPNumber.fromCodecValue(liquidity.poolReserve)
        .div(supply)
        .mul(pool.totalTokensInPool)
        .mul(new FPNumber(price))
        .mul(FPNumber.TWO)
        .toString();
    }
    return pool.totalTokensInPool.mul(new FPNumber(price)).toString();
  }

  private getDemeterApr(
    pool: DemeterPool,
    token: DemeterRewardToken | undefined,
    rewardAssetId: string,
    tvl: string | null
  ): string | null {
    if (!token || !tvl || new FPNumber(tvl).isZero()) return null;
    const rewardPrice = this.getDemeterPrice(rewardAssetId);
    if (rewardPrice === null) return null;
    const totalMultiplier = new FPNumber(pool.isFarm ? token.farmsTotalMultiplier : token.stakingTotalMultiplier);
    if (totalMultiplier.isZero()) return null;
    const allocation = pool.isFarm ? token.farmsAllocation : token.stakingAllocation;
    const emission = allocation
      .mul(token.tokenPerBlock)
      .mul(new FPNumber(pool.multiplier).div(totalMultiplier));

    return emission
      .mul(new FPNumber('5256000'))
      .mul(new FPNumber(rewardPrice))
      .div(new FPNumber(tvl))
      .mul(FPNumber.HUNDRED)
      .toString();
  }

  private getDemeterPrice(assetId: string): string | null {
    const network = this.state.networkService.networkValues.find(({ name }) => isSameString(name, 'Sora'));
    const asset = network?.assets.find(({ currencyId, id }) => currencyId === assetId || id === assetId);
    const price = asset?.priceId ? this.state.pricesService.prices.json.tokenPriceMap[asset.priceId] : undefined;

    return Number.isFinite(price) && Number(price) > 0 ? String(price) : null;
  }

  private isPositiveDecimal(value: string | undefined): boolean {
    return Boolean(value && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value) && new FPNumber(value).isGreaterThan(FPNumber.ZERO));
  }

  public async getAllReserves(network: NetworkName, address: string): Promise<DefaultPoolsParams[]> {
    const baseAssetIds = apiSora.dex.baseAssetsIds;
    const allReservesArray = baseAssetIds.map((baseAssetId) => apiSora.api.query.poolXYK.reserves.entries(baseAssetId));
    const allReserves = (await Promise.all(allReservesArray)).flat(1);

    const result = allReserves.map((item) => {
      if (item[1]?.length !== 2) return;

      const [key1, key2] = item[0].args;
      const [value1, value2] = item[1];

      const currencyId1 = toKey(key1);
      const currencyId2 = toKey(key2);

      const networkJson = this.state.networkService.getNetworkJson(network);

      const asset1 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId1));
      const asset2 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId2));

      // Если не нашли имя токена в наших файлах, то не показываем пул
      if (asset1 === undefined || asset2 === undefined) return;

      const price1 = this.state.pricesService.getTokenPrice(asset1.name);

      const groupId1 = this.state.balanceService.getTokenBalance(address, asset1.id, network).groupId; // TODO для SORA relayChain = SORA NETWORK NAME
      const groupId2 = this.state.balanceService.getTokenBalance(address, asset2.id, network).groupId; // TODO для SORA relayChain = SORA NETWORK NAME

      const accountLiquidityPool = this.getAccountLiquidityPool(asset1.currencyId!, asset2.currencyId!);

      const { firstTokenBalance, secondTokenBalance } = this.getTokensBalance({
        amount1: '',
        amount2: '',
        assetId1: asset1.id,
        assetId2: asset2.id,
        isExchangeB: false,
        networkName: network,
      });

      return {
        network,
        rewardAsset: 'PSWAP',
        tvl: new FPNumber(value1).mul(FPNumber.TWO).mul(price1).toString(),
        yourShare: accountLiquidityPool?.poolShare,
        isMyPool: accountLiquidityPool !== undefined,
        asset1: {
          assetKey: createAssetKey({
            ecosystem: String(networkJson?.ecosystem ?? 'substrate'),
            chainId: String(networkJson?.chainId ?? network),
            assetId: currencyId1,
          }),
          tokenBalance: firstTokenBalance.toString(),
          id: groupId1,
          reserve: toReserve(value1),
          icon: getSvgUrl(asset1.symbol),
          name: asset1.symbol!,
        },
        asset2: {
          assetKey: createAssetKey({
            ecosystem: String(networkJson?.ecosystem ?? 'substrate'),
            chainId: String(networkJson?.chainId ?? network),
            assetId: currencyId2,
          }),
          tokenBalance: secondTokenBalance.toString(),
          id: groupId2,
          reserve: toReserve(value2),
          icon: getSvgUrl(asset2.symbol),
          name: asset2.symbol!,
        },
      };
    });

    return result.filter((item) => item) as DefaultPoolsParams[];
  }

  public getAccountLiquidityPool(address1: string, address2: string): AccountLiquidity | undefined {
    return this.accountLiquidity.find(
      ({ firstAddress, secondAddress }) => firstAddress === address1 && secondAddress === address2
    );
  }

  public getPoolInfo(params: DefaultParams): LiquidityInfo {
    const { assetId1, assetId2, networkName, amount1, amount2 } = params;

    const address = this.state.getCurrentAddress(networkName);

    const tokenBalance1 = this.state.balanceService.getTokenBalance(address, assetId1);
    const tokenBalance2 = this.state.balanceService.getTokenBalance(address, assetId2);

    const asset1 = getSoraAsset({ assetId: assetId1, tokenBalance: tokenBalance1, network: networkName });
    const asset2 = getSoraAsset({ assetId: assetId2, tokenBalance: tokenBalance2, network: networkName });

    const accountLiquidityPool = this.getAccountLiquidityPool(asset1.address, asset2.address);

    return {
      asset1,
      asset2,
      amount1,
      amount2,
      supply: accountLiquidityPool?.totalSupply ?? '0',
      balance: accountLiquidityPool?.balance ?? '0',
      reserveA: accountLiquidityPool?.reserveA ?? '0',
      reserveB: accountLiquidityPool?.reserveB ?? '0',
      firstBalance: {
        value: accountLiquidityPool?.firstBalance ?? '0',
        valueFP: FPNumber.fromCodecValue(accountLiquidityPool?.firstBalance ?? '0', asset1.decimals),
      },
      secondBalance: {
        value: accountLiquidityPool?.secondBalance ?? '0',
        valueFP: FPNumber.fromCodecValue(accountLiquidityPool?.secondBalance ?? '0', asset2.decimals),
      },
    };
  }

  public getDemeterLockedBalance(liquidityInfo: LiquidityInfo): FPNumber {
    const baseAsset = liquidityInfo.asset1.address;
    const poolAsset = liquidityInfo.asset2.address;
    const balance = FPNumber.fromCodecValue(liquidityInfo.balance);

    const lockedBalance = this.demeterAccountPools.reduce((value, accountPool) => {
      if (accountPool.baseAsset === baseAsset && accountPool.poolAsset === poolAsset && accountPool.isFarm)
        return FPNumber.max(value, accountPool.pooledTokens) as FPNumber;

      return value;
    }, FPNumber.ZERO);

    const maxLocked = FPNumber.min(balance, lockedBalance) as FPNumber;

    return maxLocked;
  }

  public getCeresLockedBalance(liquidityInfo: LiquidityInfo): FPNumber {
    const baseAsset = liquidityInfo.asset1.address;
    const poolAsset = liquidityInfo.asset2.address;
    const balance = FPNumber.fromCodecValue(liquidityInfo.balance);
    const lockedBalance = this.ceresLockedPools.reduce((value, accountLockedPool) => {
      if (accountLockedPool.assetA === baseAsset && accountLockedPool.assetB === poolAsset) {
        return value.add(accountLockedPool.poolTokens);
      }

      return value;
    }, FPNumber.ZERO);

    const maxLocked = FPNumber.min(balance, lockedBalance) as FPNumber;

    return maxLocked;
  }

  public getLiquidityBalance(params: DefaultParams): FPNumber {
    const poolInfo = this.getPoolInfo(params);
    const demeterLockedBalance = this.getDemeterLockedBalance(poolInfo);
    const ceresLockedBalance = this.getCeresLockedBalance(poolInfo);
    const maxLocked = FPNumber.max(demeterLockedBalance, ceresLockedBalance) as FPNumber;

    return FPNumber.fromCodecValue(poolInfo.balance).sub(maxLocked);
  }

  public async getReserves(address1: string, address2: string): Promise<Array<CodecString>> {
    try {
      const reserves = await apiSora.poolXyk.getReserves(address1, address2);

      return reserves ?? ['0', '0'];
    } catch {
      return ['0', '0'];
    }
  }

  public async getTotalSupply(address1: string, address2: string): Promise<CodecString> {
    try {
      const totalSupply = await apiSora.poolXyk.getTotalSupply(address1, address2);

      return totalSupply ?? '0';
    } catch {
      return '0';
    }
  }

  public async getMinted(params: LiquidityInfo, totalSupply: string): Promise<FPNumber> {
    const { asset1, asset2, amount1, amount2 } = params;

    const [reserve1, reserve2] = await this.getReserves(asset1.address, asset2.address);

    const [minted] = apiSora.poolXyk.estimatePoolTokensMinted(
      asset1,
      asset2,
      amount1,
      amount2,
      reserve1,
      reserve2,
      totalSupply
    );

    return FPNumber.fromCodecValue(minted);
  }

  public async getShareOfPoolByAddLiquidity(params: GetShareOfPoolRequest): Promise<string> {
    const poolInfo = this.getPoolInfo(params);
    const { balance, asset1, asset2 } = poolInfo;
    const totalSupply = await this.getTotalSupply(asset1.address, asset2.address);

    if (totalSupply === '0') {
      if (+poolInfo.amount1 === 0) return '0';

      return '100';
    }

    const minted = await this.getMinted(poolInfo, totalSupply);
    const total = FPNumber.fromCodecValue(totalSupply);
    const existed = FPNumber.fromCodecValue(balance);

    if (total.isZero() && minted.isZero()) return FPNumber.HUNDRED.toLocaleString();

    return minted.add(existed).div(total.add(minted)).mul(FPNumber.HUNDRED).toLocaleString() || '0';
  }

  public getPart(liquidityInfo: LiquidityInfo, isExchangeB: boolean): FPNumber {
    if (isExchangeB) return new FPNumber(liquidityInfo.amount2).div(liquidityInfo.secondBalance.valueFP);

    return new FPNumber(liquidityInfo.amount1).div(liquidityInfo.firstBalance.valueFP);
  }

  public getPoolAmountValue(params: DefaultParams): string {
    const { isExchangeB } = params;

    const poolInfo = this.getPoolInfo(params);
    const part = this.getPart(poolInfo, isExchangeB);

    const result = isExchangeB ? part.mul(poolInfo.firstBalance.valueFP) : part.mul(poolInfo.secondBalance.valueFP);

    return result.toString();
  }

  public getRemoved(params: DefaultParams): string {
    const poolInfo = this.getPoolInfo(params);
    const part = this.getPart(poolInfo, params.isExchangeB);
    const liquidityBalance = this.getLiquidityBalance(params);

    return part.mul(liquidityBalance).toString();
  }

  public getShareOfPoolByRemoveLiquidity(params: GetShareOfPoolRequest): string {
    const { balance, supply } = this.getPoolInfo(params);

    const existed = FPNumber.fromCodecValue(balance);
    const removed = this.getRemoved(params);
    const totalSupply = FPNumber.fromCodecValue(supply);
    const totalSupplyAfter = totalSupply.sub(removed);

    if (existed.isZero() || totalSupply.isZero() || totalSupplyAfter.isZero()) return '0';

    const result = existed.sub(removed).div(totalSupplyAfter).mul(FPNumber.HUNDRED);

    return FPNumber.lte(result, FPNumber.ZERO) || FPNumber.gte(result, FPNumber.HUNDRED)
      ? '0'
      : result.toString() || '0';
  }

  public getTokensBalance(params: DefaultParams) {
    const { asset1, asset2, firstBalance, secondBalance, balance } = this.getPoolInfo(params);

    const liquidityBalance = this.getLiquidityBalance(params).toString();
    const balanceFP = FPNumber.fromCodecValue(balance);

    const tokenBalance1 = FPNumber.fromCodecValue(firstBalance.value, asset1.decimals);
    const tokenBalance2 = FPNumber.fromCodecValue(secondBalance.value, asset2.decimals);

    const firstTokenBalance = tokenBalance1.mul(liquidityBalance).div(balanceFP);
    const secondTokenBalance = tokenBalance2.mul(liquidityBalance).div(balanceFP);

    return {
      firstTokenBalance,
      secondTokenBalance,
      liquidityBalance,
    };
  }

  public async makePool({ params, type }: MakePoolsRequest): Promise<BasicTxResponse> {
    if (type === 'addLiquidity') return this.addLiquidity(params as RequestAddLiquidity);

    if (type === 'removeLiquidity') return this.removeLiquidity(params as RequestRemoveLiquidity);

    return {
      status: false,
      errors: [{ message: '[POOLS] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  private liquidityError(
    message: string,
    code: BasicTxErrorCode | TransferErrorCode = BasicTxErrorCode.INVALID_PARAM
  ): LiquidityPreparation {
    return { ok: false, response: { status: false, errors: [{ code, message }] } };
  }

  private async prepareLiquidityMutation(
    params: RequestAddLiquidity | RequestRemoveLiquidity,
    operation: Operation.AddLiquidity | Operation.RemoveLiquidity
  ): Promise<LiquidityPreparation> {
    if (!this.state.actionCapabilityService?.isActionEnabled('polkaswap')) {
      return this.liquidityError(
        'Polkaswap liquidity actions are temporarily unavailable.',
        TransferErrorCode.UNSUPPORTED
      );
    }
    if (!this.state.soraDisclaimerService?.isAccepted()) {
      return this.liquidityError('Accept the Polkaswap risk disclaimer first.', TransferErrorCode.UNSUPPORTED);
    }
    if (
      !isSameString(params.networkName, SORA_NETWORK_NAME) ||
      !params.assetId1 ||
      !params.assetId2 ||
      params.assetId1 === params.assetId2
    ) {
      return this.liquidityError('Select two exact SORA assets.');
    }
    if (
      !this.isPositiveDecimal(params.amount1) ||
      !this.isPositiveDecimal(params.amount2) ||
      !Number.isFinite(params.slippage) ||
      params.slippage < 0 ||
      params.slippage > 100
    ) {
      return this.liquidityError('Refresh the liquidity amounts and slippage before confirming.');
    }

    const signingContext = this.captureSoraSigningContext();
    if (!signingContext) {
      return this.liquidityError('A locally signable SORA account is required.', TransferErrorCode.UNSUPPORTED);
    }
    if (!(await this.isSoraRuntimeReady(params.networkName))) {
      return this.liquidityError('The SORA runtime is unavailable.', TransferErrorCode.UNSUPPORTED);
    }

    try {
      const cachedIdentity = this.getPoolInfo(params);
      if (
        !cachedIdentity.asset1.address ||
        !cachedIdentity.asset2.address ||
        isSameString(cachedIdentity.asset1.address, cachedIdentity.asset2.address)
      ) {
        return this.liquidityError('Select two exact SORA assets.');
      }

      const [asset1, asset2, reserves, totalSupply, poolBalance, fee] = await Promise.all([
        apiSora.assets.getAccountAsset(cachedIdentity.asset1.address),
        apiSora.assets.getAccountAsset(cachedIdentity.asset2.address),
        apiSora.poolXyk.getReserves(cachedIdentity.asset1.address, cachedIdentity.asset2.address),
        apiSora.poolXyk.getTotalSupply(cachedIdentity.asset1.address, cachedIdentity.asset2.address),
        this.getFirstObservableValue(
          apiSora.poolXyk.getAccountPoolBalanceObservable(
            cachedIdentity.asset1.address,
            cachedIdentity.asset2.address
          ) as unknown as FirstValueObservable<string | null>
        ),
        this.refreshSoraFee(operation),
      ]);

      if (
        !isSameString(asset1.address, cachedIdentity.asset1.address) ||
        !isSameString(asset2.address, cachedIdentity.asset2.address)
      ) {
        return this.liquidityError('The selected SORA asset identity changed. Review the action again.');
      }
      if (!reserves || reserves.length !== 2 || totalSupply === null || !fee) {
        return this.liquidityError('Refresh the current pool state and SORA network fee.');
      }
      if (!params.expectedFee || fee.toString() !== params.expectedFee) {
        return this.liquidityError('The SORA network fee changed. Review and confirm again.');
      }

      const reserve1 = FPNumber.fromCodecValue(reserves[0], asset1.decimals);
      const reserve2 = FPNumber.fromCodecValue(reserves[1], asset2.decimals);
      const supply = FPNumber.fromCodecValue(totalSupply);
      const accountPoolBalance = FPNumber.fromCodecValue(poolBalance ?? '0');
      if (
        !reserve1.isFinity() ||
        !reserve1.isGteZero() ||
        !reserve2.isFinity() ||
        !reserve2.isGteZero() ||
        !supply.isFinity() ||
        !supply.isGteZero() ||
        !accountPoolBalance.isFinity() ||
        !accountPoolBalance.isGteZero()
      ) {
        return this.liquidityError('The authoritative pool state is invalid.');
      }

      const xorAsset = isSameString(asset1.address, SORA_XOR_ASSET_ID)
        ? asset1
        : isSameString(asset2.address, SORA_XOR_ASSET_ID)
          ? asset2
          : await apiSora.assets.getAccountAsset(SORA_XOR_ASSET_ID);
      if (!isSameString(xorAsset.address, SORA_XOR_ASSET_ID)) {
        return this.liquidityError('The authoritative XOR balance could not be verified.');
      }

      return {
        ok: true,
        value: {
          signingContext,
          asset1,
          asset2,
          xorAsset,
          fee,
          reserves: [reserves[0], reserves[1]],
          totalSupply,
          poolBalance: poolBalance ?? '0',
        },
      };
    } catch {
      return this.liquidityError('Refresh the current pool, balances, and SORA network fee.');
    }
  }

  private async isLiquidityBoundaryCurrent(context: SoraSigningContext): Promise<boolean> {
    const runtimeReady = await this.isSoraRuntimeReady();

    return Boolean(
      runtimeReady &&
        this.state.actionCapabilityService?.isActionEnabled('polkaswap') &&
        this.state.soraDisclaimerService?.isAccepted() &&
        this.isSigningContextCurrent(context)
    );
  }

  public async addLiquidity(params: RequestAddLiquidity): Promise<BasicTxResponse> {
    const prepared = await this.prepareLiquidityMutation(params, Operation.AddLiquidity);
    if ('response' in prepared) return prepared.response;

    const { amount1, amount2, slippage } = params;
    const { asset1, asset2, xorAsset, fee, signingContext } = prepared.value;
    const firstAmount = new FPNumber(amount1);
    const secondAmount = new FPNumber(amount2);
    const firstAvailable = FPNumber.fromCodecValue(asset1.balance.transferable, asset1.decimals);
    const secondAvailable = FPNumber.fromCodecValue(asset2.balance.transferable, asset2.decimals);
    const xorAvailable = FPNumber.fromCodecValue(xorAsset.balance.transferable, xorAsset.decimals);
    const firstRequired = isSameString(asset1.address, SORA_XOR_ASSET_ID) ? firstAmount.add(fee) : firstAmount;
    const secondRequired = isSameString(asset2.address, SORA_XOR_ASSET_ID) ? secondAmount.add(fee) : secondAmount;

    if (firstAvailable.lt(firstRequired) || secondAvailable.lt(secondRequired)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The selected SORA asset balance is insufficient.' }],
      };
    }
    if (xorAvailable.lt(fee)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'Add enough XOR to pay the current SORA network fee.' }],
      };
    }
    if (!(await this.isLiquidityBoundaryCurrent(signingContext))) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'The SORA account or runtime changed. Review the action again.' }],
      };
    }

    try {
      if (
        !this.state.keyringService.unlockPair(signingContext.selectedAddress) ||
        !this.state.actionCapabilityService?.isActionEnabled('polkaswap') ||
        !this.state.soraDisclaimerService?.isAccepted() ||
        !this.isSigningContextCurrent(signingContext)
      ) {
        return {
          status: false,
          errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Unlock the selected SORA account and try again.' }],
        };
      }
      apiSora.shouldPairBeLocked = false;
      await apiSora.poolXyk.add(asset1, asset2, amount1, amount2, slippage);
    } catch (ex) {
      const message = `[POOLS] Add Liquidity failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.ADD_LIQUIDITY_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async removeLiquidity(params: RequestRemoveLiquidity): Promise<BasicTxResponse> {
    const prepared = await this.prepareLiquidityMutation(params, Operation.RemoveLiquidity);
    if ('response' in prepared) return prepared.response;

    const { amount1, amount2, slippage, isExchangeB } = params;
    const { asset1, asset2, xorAsset, fee, reserves, totalSupply, poolBalance, signingContext } = prepared.value;
    const liquidity = FPNumber.fromCodecValue(poolBalance);
    const supply = FPNumber.fromCodecValue(totalSupply);
    const reserve1 = FPNumber.fromCodecValue(reserves[0], asset1.decimals);
    const reserve2 = FPNumber.fromCodecValue(reserves[1], asset2.decimals);
    const xorAvailable = FPNumber.fromCodecValue(xorAsset.balance.transferable, xorAsset.decimals);

    if (liquidity.isZero() || supply.isZero() || reserve1.isZero() || reserve2.isZero()) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.INVALID_PARAM, message: 'There is no removable liquidity in this pool.' }],
      };
    }
    if (xorAvailable.lt(fee)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'Add enough XOR to pay the current SORA network fee.' }],
      };
    }

    const firstAvailable = reserve1.mul(liquidity).div(supply);
    const secondAvailable = reserve2.mul(liquidity).div(supply);
    const requested = new FPNumber(isExchangeB ? amount2 : amount1);
    const available = isExchangeB ? secondAvailable : firstAvailable;
    const desiredMarker = requested.div(available).mul(liquidity);
    if (!desiredMarker.isFinity() || !desiredMarker.isGreaterThan(FPNumber.ZERO) || desiredMarker.gt(liquidity)) {
      return {
        status: false,
        errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The requested withdrawal exceeds the available pool position.' }],
      };
    }
    if (!(await this.isLiquidityBoundaryCurrent(signingContext))) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'The SORA account or runtime changed. Review the action again.' }],
      };
    }

    try {
      if (
        !this.state.keyringService.unlockPair(signingContext.selectedAddress) ||
        !this.state.actionCapabilityService?.isActionEnabled('polkaswap') ||
        !this.state.soraDisclaimerService?.isAccepted() ||
        !this.isSigningContextCurrent(signingContext)
      ) {
        return {
          status: false,
          errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Unlock the selected SORA account and try again.' }],
        };
      }
      apiSora.shouldPairBeLocked = false;
      await apiSora.poolXyk.remove(
        asset1,
        asset2,
        desiredMarker.toString(),
        reserves[0],
        reserves[1],
        totalSupply,
        slippage
      );
    } catch (ex) {
      const message = `[POOLS] Remove Liquidity failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.REMOVE_LIQUIDITY_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }
}
