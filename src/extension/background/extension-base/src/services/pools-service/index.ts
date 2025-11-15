import {
  BasicTxErrorCode,
  TransferErrorCode,
  type BasicTxResponse,
  type Port,
  type TokenGroup,
} from '@extension-base/background/types/types';
import { APIItemState } from '@extension-base/api/types/networks';
import { getSoraUtil } from '@extension-base/services/utils/sora';
import { BehaviorSubject, type Subscription } from 'rxjs';
import { type u128 } from '@polkadot/types';
import type { Codec } from '@polkadot/types/types';
import type { AccountLiquidity } from '@sora/poolXyk/types';
import type { AccountLockedPool } from '@sora/ceresLiquidityLocker/types';
import type {
  GetShareOfPoolRequest,
  RequestAddLiquidity,
  PoolsParamsResponse,
  MakePoolsRequest,
  RequestRemoveLiquidity,
  PoolsParamsRequest,
  DefaultPoolsParams,
  DefaultParams,
  AssetPool,
} from './types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import type { Asset as SoraAsset } from '@sora/assets/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import { getSoraAsset } from '@/extension/background/extension-base/src/api/substrate/sora';
import { findTokenBalanceByNetwork, isSameString } from '@/helpers';
import { FPNumber, type CodecString } from '@/lib/fpNumber';

const ensureSoraLoaded = async () => {
  const module = await getSoraUtil();

  return module;
};

type StorageKeyArg = {
  code?: { toString(): string };
  toString(): string;
};

const toReserve = (value: u128 | Codec | string): string => {
  const raw = typeof value === 'string' ? value : value.toString();

  return new FPNumber(raw).toString();
};

const toKey = (address: StorageKeyArg) => address.code?.toString() ?? address.toString();

const getSvgUrl = (assetName: string): string =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/${assetName.toUpperCase()}.svg`;

type PoolAssetSource = {
  id: string;
  symbol?: string;
  name?: string;
  icon?: string;
  color?: string;
  priceId?: string;
  currencyId?: string;
  precision?: number;
  decimals?: number;
};

type PoolAssetContext = {
  asset: PoolAssetSource;
  tokenGroup?: TokenGroup;
  balance?: BalanceItem;
  reserve: string;
  myTokenBalance: string;
};

interface LiquidityInfo {
  supply: string;
  balance: string;
  asset1: SoraAsset;
  asset2: SoraAsset;
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
  private readonly poolsParamsSubject = new BehaviorSubject<DefaultPoolsParams[]>([]);

  userPoolsSubscription: Subscription | null = null;
  liquidityUpdatedSubscription: Subscription | null = null;
  ceresLiquidityLockerSubscription: Subscription | null = null;
  private lastRequestedNetworks: NetworkName[] = [];
  private refreshPromise: Promise<DefaultPoolsParams[]> | null = null;

  accountLiquidity: AccountLiquidity[] = [];
  ceresLockedPools: AccountLockedPool[] = [];

  constructor(private state: State) {}

  private createPoolAssetMetadata({
    asset,
    tokenGroup,
    balance,
    reserve,
    myTokenBalance,
  }: PoolAssetContext): AssetPool {
    const fallbackSymbol = asset.symbol ?? asset.name ?? asset.id;
    const symbol = (tokenGroup?.symbol ?? fallbackSymbol ?? '').toUpperCase();
    const displayName = symbol || (fallbackSymbol ? fallbackSymbol.toUpperCase() : '');
    const iconFromGroup = tokenGroup?.icon;
    const icon = iconFromGroup ?? asset.icon ?? getSvgUrl((displayName || asset.id).toUpperCase());
    const color = tokenGroup?.color ?? asset.color ?? '';
    const priceId = tokenGroup?.priceId ?? asset.priceId ?? fallbackSymbol ?? asset.id;
    const balanceState = balance?.state ?? APIItemState.PENDING;
    const transferableAmount = balance?.transferable ?? '0';
    const totalAmount = balance?.total ?? transferableAmount;
    const decimals = balance?.precision ?? asset.precision ?? asset.decimals ?? 18;
    const groupId = tokenGroup?.groupId ?? asset.id;

    return {
      id: groupId,
      assetId: asset.id,
      symbol,
      name: displayName,
      icon,
      color,
      reserve: toReserve(reserve),
      tokenBalance: myTokenBalance,
      transferableAmount,
      totalAmount,
      priceId,
      balanceState,
      decimals,
    };
  }

  public async getPoolsParams(params: PoolsParamsRequest): Promise<PoolsParamsResponse> {
    const { networks } = params;

    await this.refreshPoolsParams(networks);

    return this.poolsParamsSubject.value;
  }

  private async ensureSubscriptions() {
    const { api: apiSora } = await ensureSoraLoaded();

    if (this.userPoolsSubscription === null) {
      this.userPoolsSubscription = apiSora.poolXyk.getUserPoolsSubscription();

      this.liquidityUpdatedSubscription = apiSora.poolXyk.updated.subscribe(() => {
        this.accountLiquidity = apiSora.poolXyk.accountLiquidity;
        this.accountLiquiditySubject.next(this.accountLiquidity);
        console.info('accountLiquidity subscription: ', this.accountLiquidity);

        void this.refreshPoolsParams(this.lastRequestedNetworks);
      });
    }

    if (this.ceresLiquidityLockerSubscription === null) {
      this.ceresLiquidityLockerSubscription = apiSora.ceresLiquidityLocker
        .getLockerDataObservable()
        .subscribe((data) => {
          this.ceresLockedPools = data;

          console.info('ceresLockedPools subscription: ', this.ceresLockedPools);

          void this.refreshPoolsParams(this.lastRequestedNetworks);
        });
    }
  }

  private async fetchPoolsParams(networks: NetworkName[]): Promise<DefaultPoolsParams[]> {
    await this.ensureSubscriptions();

    if (networks.length === 0) return [];

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

  private async refreshPoolsParams(networks: NetworkName[]): Promise<DefaultPoolsParams[]> {
    if (!networks || networks.length === 0) {
      return this.poolsParamsSubject.value;
    }

    this.lastRequestedNetworks = networks;

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchPoolsParams(networks)
      .then((result) => {
        this.poolsParamsSubject.next(result);

        return result;
      })
      .catch((error) => {
        console.warn('[PoolsService] Failed to refresh pools metadata', error);

        return this.poolsParamsSubject.value;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
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

  public async subscribePoolsParams(id: string, request: PoolsParamsRequest, port?: Port): Promise<boolean> {
    await this.refreshPoolsParams(request.networks);

    const cb = this.state.subscriptionService.createSubscription<'pri(pools.poolsParams.subscribe)'>(id, port);

    const subscription = this.poolsParamsSubject.subscribe((params) => cb(params));

    this.state.subscriptionService.setUnsubscriptionHandle(id, subscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return true;
  }

  public unsubscribePools(): void {
    this.userPoolsSubscription?.unsubscribe();
    this.liquidityUpdatedSubscription?.unsubscribe();
    this.ceresLiquidityLockerSubscription?.unsubscribe();

    this.userPoolsSubscription = null;
    this.liquidityUpdatedSubscription = null;
    this.ceresLiquidityLockerSubscription = null;
    this.lastRequestedNetworks = [];
    this.poolsParamsSubject.next([]);
  }

  public async getAllReserves(network: NetworkName, address: string): Promise<DefaultPoolsParams[]> {
    const { api: apiSora } = await ensureSoraLoaded();
    const baseAssetIds = apiSora.dex.baseAssetsIds;
    const allReservesArray = baseAssetIds.map((baseAssetId) => apiSora.api.query.poolXYK.reserves.entries(baseAssetId));
    const allReserves = (await Promise.all(allReservesArray)).flat(1);
    const accountBalances = this.state.balanceService.getAccountBalance(address) ?? [];

    const result = allReserves.reduce<DefaultPoolsParams[]>((acc, item) => {
      const reserveValues = item[1] as unknown as Codec[] | undefined;

      if (!Array.isArray(reserveValues) || reserveValues.length !== 2) return acc;

      const [key1, key2] = item[0].args;
      const [value1, value2] = reserveValues as [Codec, Codec];
      const reserveValue1 = value1.toString();
      const reserveValue2 = value2.toString();

      const currencyId1 = toKey(key1);
      const currencyId2 = toKey(key2);

      const networkJson = this.state.networkService.getNetworkJson(network);

      const asset1 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId1));
      const asset2 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId2));

      if (!asset1 || !asset2) return acc;

      const tokenBalance1Group = accountBalances.find(({ groupId }) => isSameString(groupId, asset1.id));
      const tokenBalance2Group = accountBalances.find(({ groupId }) => isSameString(groupId, asset2.id));
      const tokenBalance1 = findTokenBalanceByNetwork(tokenBalance1Group, network);
      const tokenBalance2 = findTokenBalanceByNetwork(tokenBalance2Group, network);

      const priceId1 = tokenBalance1Group?.priceId ?? asset1.name ?? asset1.id;
      const priceId2 = tokenBalance2Group?.priceId ?? asset2.name ?? asset2.id;

      const accountLiquidityPool = this.getAccountLiquidityPool(
        asset1.currencyId ?? asset1.id,
        asset2.currencyId ?? asset2.id
      );

      const { firstTokenBalance, secondTokenBalance } = this.getTokensBalance({
        amount1: '',
        amount2: '',
        assetId1: asset1.id,
        assetId2: asset2.id,
        isExchangeB: false,
        networkName: network,
      });

      const poolAsset1 = this.createPoolAssetMetadata({
        asset: {
          id: asset1.id,
          symbol: asset1.symbol,
          name: asset1.name,
          icon: asset1.icon,
          color: asset1.color,
          priceId: asset1.priceId,
          currencyId: asset1.currencyId,
          precision: asset1.precision,
        },
        tokenGroup: tokenBalance1Group,
        balance: tokenBalance1,
        reserve: reserveValue1,
        myTokenBalance: firstTokenBalance.toString(),
      });

      const poolAsset2 = this.createPoolAssetMetadata({
        asset: {
          id: asset2.id,
          symbol: asset2.symbol,
          name: asset2.name,
          icon: asset2.icon,
          color: asset2.color,
          priceId: asset2.priceId,
          currencyId: asset2.currencyId,
          precision: asset2.precision,
        },
        tokenGroup: tokenBalance2Group,
        balance: tokenBalance2,
        reserve: reserveValue2,
        myTokenBalance: secondTokenBalance.toString(),
      });

      const reserveAmount1 = FPNumber.fromCodecValue(reserveValue1, poolAsset1.decimals);
      const reserveAmount2 = FPNumber.fromCodecValue(reserveValue2, poolAsset2.decimals);
      const price1 = new FPNumber(this.state.pricesService.getTokenPrice(priceId1).toString());
      const price2 = new FPNumber(this.state.pricesService.getTokenPrice(priceId2).toString());
      const tvlValue = reserveAmount1.mul(price1).add(reserveAmount2.mul(price2)).toString();

      acc.push({
        poolId: `${poolAsset1.assetId}-${poolAsset2.assetId}`,
        network,
        rewardAsset: 'PSWAP',
        tvl: tvlValue,
        yourShare: accountLiquidityPool?.poolShare,
        isMyPool: accountLiquidityPool !== undefined,
        updatedAt: Date.now(),
        asset1: poolAsset1,
        asset2: poolAsset2,
      });

      return acc;
    }, []);

    return result;
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

  public getCeresLockedBalance(liquidityInfo: LiquidityInfo) {
    const baseAsset = liquidityInfo.asset1.address;
    const poolAsset = liquidityInfo.asset2.address;
    const balance = FPNumber.fromCodecValue(liquidityInfo.balance);
    const lockedBalance = this.ceresLockedPools.reduce((value, accountLockedPool) => {
      if (accountLockedPool.assetA === baseAsset && accountLockedPool.assetB === poolAsset) {
        return value.add(accountLockedPool.poolTokens);
      }

      return value;
    }, FPNumber.ZERO);

    const maxLocked = FPNumber.min(balance, lockedBalance) ?? FPNumber.ZERO;

    return maxLocked;
  }

  public getLiquidityBalance(params: DefaultParams) {
    const poolInfo = this.getPoolInfo(params);
    const ceresLockedBalance = this.getCeresLockedBalance(poolInfo);
    const maxLocked = ceresLockedBalance ?? FPNumber.ZERO;

    return FPNumber.fromCodecValue(poolInfo.balance).sub(maxLocked);
  }

  public async getReserves(address1: string, address2: string): Promise<Array<CodecString>> {
    const { api: apiSora } = await ensureSoraLoaded();

    try {
      const reserves = await apiSora.poolXyk.getReserves(address1, address2);

      return reserves ?? ['0', '0'];
    } catch {
      return ['0', '0'];
    }
  }

  public async getTotalSupply(address1: string, address2: string): Promise<CodecString> {
    const { api: apiSora } = await ensureSoraLoaded();

    try {
      const totalSupply = await apiSora.poolXyk.getTotalSupply(address1, address2);

      return totalSupply ?? '0';
    } catch {
      return '0';
    }
  }

  public async getMinted(params: LiquidityInfo, totalSupply: string) {
    const { api: apiSora } = await ensureSoraLoaded();
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
    await ensureSoraLoaded();
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

  public getPart(liquidityInfo: LiquidityInfo, isExchangeB: boolean) {
    if (isExchangeB) return new FPNumber(liquidityInfo.amount2).div(liquidityInfo.secondBalance.valueFP);

    return new FPNumber(liquidityInfo.amount1).div(liquidityInfo.firstBalance.valueFP);
  }

  public async getPoolAmountValue(params: DefaultParams): Promise<string> {
    await ensureSoraLoaded();
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

  public async getShareOfPoolByRemoveLiquidity(params: GetShareOfPoolRequest): Promise<string> {
    await ensureSoraLoaded();
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

    if (balanceFP.isZero()) {
      return {
        firstTokenBalance: FPNumber.ZERO,
        secondTokenBalance: FPNumber.ZERO,
        liquidityBalance,
      };
    }

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
    const { api: apiSora } = await ensureSoraLoaded();
    const { networkName } = params;
    const apiProps = this.state.getSubstrateApiMap[networkName.toLowerCase()];
    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    apiSora.shouldPairBeLocked = false;

    if (type === 'addLiquidity') return this.addLiquidity(params as RequestAddLiquidity);

    if (type === 'removeLiquidity') return this.removeLiquidity(params as RequestRemoveLiquidity);

    return {
      status: false,
      errors: [{ message: '[POOLS] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  public async addLiquidity(params: RequestAddLiquidity): Promise<BasicTxResponse> {
    const { api: apiSora } = await ensureSoraLoaded();
    const { amount1, amount2, slippage } = params;
    const { asset1, asset2 } = this.getPoolInfo(params);

    try {
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
    const { api: apiSora } = await ensureSoraLoaded();
    const { amount1, amount2, slippage, isExchangeB } = params;
    const { asset1, asset2, supply, reserveA, reserveB } = this.getPoolInfo(params);
    const { firstTokenBalance, secondTokenBalance, liquidityBalance } = this.getTokensBalance(params);

    const part1 = new FPNumber(amount1).div(firstTokenBalance);
    const part2 = new FPNumber(amount2).div(secondTokenBalance);

    const desiredMarker1 = part1.mul(liquidityBalance).toString();
    const desiredMarker2 = part2.mul(liquidityBalance).toString();

    const desiredMarker = isExchangeB ? desiredMarker2 : desiredMarker1;

    try {
      await apiSora.poolXyk.remove(asset1, asset2, desiredMarker, reserveA, reserveB, supply, slippage);
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
