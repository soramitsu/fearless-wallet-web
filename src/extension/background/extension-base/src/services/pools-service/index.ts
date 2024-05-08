import { api as apiSora, type CodecString, FPNumber } from '@sora-substrate/util';
import {
  BasicTxErrorCode,
  TransferErrorCode,
  type BasicTxResponse,
  type Port,
} from '@extension-base/background/types/types';
import { getSoraAsset } from '@extension-base/api/substrate/sora';
import { type u128 } from '@polkadot/types';
import { type AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import { BehaviorSubject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/services';
import { type DemeterAccountPool } from '@sora-substrate/util/build/demeterFarming/types';
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
} from './types';
import type { Subscription } from 'rxjs';

import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import type { Asset } from '@sora-substrate/util/src/assets/types';
import { isSameString } from '@/helpers';

const toReserve = (value: u128): string => new FPNumber(value).toString();

const getSvgUrl = (assetName: string): string =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/tokens/coloured/${assetName.toUpperCase()}.svg`;

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

  userPoolsSubscription: Subscription | null = null;
  liquidityUpdatedSubscription: Subscription | null = null;
  demeterFarmingSubscription: Subscription | null = null;
  ceresLiquidityLockerSubscription: Subscription | null = null;

  accountLiquidity: AccountLiquidity[] = [];
  demeterAccountPools: DemeterAccountPool[] = [];
  ceresLockedPools: AccountLockedPool[] = [];

  constructor(private state: State) {}

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

      return [...allReserves] as DefaultPoolsParams[];
    });

    return (await Promise.all(promises)).flat();
  }

  public async accountLiquiditySubscribe(id: string, port: Port): Promise<boolean> {
    const cb = createSubscription<'pri(pools.accountLiquidity)'>(id, port);

    const subscription = this.accountLiquiditySubject.subscribe((accountLiquidity) => cb(accountLiquidity));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  public unsubscribePools(): void {
    this.userPoolsSubscription?.unsubscribe();
    this.liquidityUpdatedSubscription?.unsubscribe();
    this.demeterFarmingSubscription?.unsubscribe();
    this.ceresLiquidityLockerSubscription?.unsubscribe();
  }

  public async getAllReserves(network: NetworkName, address: string): Promise<DefaultPoolsParams[]> {
    const toKey = (address: any) => address.code.toString();

    const baseAssetIds = apiSora.dex.baseAssetsIds;
    const allReservesArray = baseAssetIds.map((baseAssetId) => apiSora.api.query.poolXYK.reserves.entries(baseAssetId));
    const allReserves = (await Promise.all(allReservesArray)).flat(1);

    const result = allReserves.map((item) => {
      if (item[1]?.length !== 2) return;

      const [key1, key2] = item[0].args;
      const [value1, value2] = item[1];

      const currencyId1 = toKey(key1);
      const currencyId2 = toKey(key2);

      const networkJson = this.state.networkService.getNetworkByKey(network);

      const asset1 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId1));
      const asset2 = networkJson?.assets.find(({ currencyId }) => isSameString(currencyId, currencyId2));

      // Если не нашли имя токена в наших файлах, то не показываем пул
      if (asset1 === undefined || asset2 === undefined) return;

      const price1 = this.state.pricesService.getTokenPrice(asset1.name);

      const groupId1 = this.state.balanceService.getTokenBalance(address, asset1.id, network).groupId; // TODO для SORA relayChain = SORA NETWORK NAME
      const groupId2 = this.state.balanceService.getTokenBalance(address, asset2.id, network).groupId; // TODO для SORA relayChain = SORA NETWORK NAME

      const accountLiquidityPool = this.getAccountLiquidityPool(asset1.currencyId!, asset2.currencyId!);

      return {
        network,
        rewardAsset: 'PSWAP',
        tvl: new FPNumber(value1).mul(FPNumber.TWO).mul(price1).toString(),
        yourShare: accountLiquidityPool?.poolShare,
        isMyPool: accountLiquidityPool !== undefined,
        asset1: {
          myAmount: FPNumber.fromCodecValue(accountLiquidityPool?.firstBalance ?? 0).toString(),
          id: groupId1,
          reserve: toReserve(value1),
          icon: getSvgUrl(asset1.symbol),
          name: asset1.symbol!,
        },
        asset2: {
          myAmount: FPNumber.fromCodecValue(accountLiquidityPool?.secondBalance ?? 0).toString(),
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

    const asset1 = getSoraAsset({ assetId: assetId1, tokenBalance: tokenBalance1, network: networkName }, this.state);
    const asset2 = getSoraAsset({ assetId: assetId2, tokenBalance: tokenBalance2, network: networkName }, this.state);

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
    const liquidityInfo = this.getPoolInfo(params);
    const demeterLockedBalance = this.getDemeterLockedBalance(liquidityInfo);
    const ceresLockedBalance = this.getCeresLockedBalance(liquidityInfo);
    const maxLocked = FPNumber.max(demeterLockedBalance, ceresLockedBalance) as FPNumber;

    return FPNumber.fromCodecValue(liquidityInfo.balance).sub(maxLocked);
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

    const liquidityInfo = this.getPoolInfo(params);
    const part = this.getPart(liquidityInfo, isExchangeB);

    const result = isExchangeB
      ? part.mul(liquidityInfo.firstBalance.valueFP)
      : part.mul(liquidityInfo.secondBalance.valueFP);

    return result.toString();
  }

  public getRemoved(params: DefaultParams): string {
    const liquidityInfo = this.getPoolInfo(params);
    const part = this.getPart(liquidityInfo, params.isExchangeB);
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

    return FPNumber.lte(result, FPNumber.ZERO) ? '0' : result.toLocaleString() || '0';
  }

  public async makePool({ params, type }: MakePoolsRequest): Promise<BasicTxResponse> {
    const { networkName, isSavePass } = params;
    const apiProps = this.state.getSubstrateApiMap[networkName.toLowerCase()];
    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    apiSora.shouldPairBeLocked = !isSavePass;

    if (type === 'addLiquidity') return this.addLiquidity(params as RequestAddLiquidity);

    if (type === 'removeLiquidity') return this.removeLiquidity(params as RequestRemoveLiquidity);

    return {
      status: false,
      errors: [{ message: '[POOLS] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  public async addLiquidity(params: RequestAddLiquidity): Promise<BasicTxResponse> {
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
    const { amount1, amount2, slippage, isExchangeB } = params;
    const { asset1, asset2, supply, reserveA, reserveB, firstBalance, secondBalance, balance } =
      this.getPoolInfo(params);

    const liquidityBalance = this.getLiquidityBalance(params).toString();
    const balanceFP = FPNumber.fromCodecValue(balance);

    const tokenBalance1 = FPNumber.fromCodecValue(firstBalance.value, asset1.decimals);
    const tokenBalance2 = FPNumber.fromCodecValue(secondBalance.value, asset2.decimals);

    const firstTokenBalance = tokenBalance1.mul(liquidityBalance).div(balanceFP);
    const secondTokenBalance = tokenBalance2.mul(liquidityBalance).div(balanceFP);

    const part1 = new FPNumber(amount1).div(firstTokenBalance);
    const part2 = new FPNumber(amount2).div(secondTokenBalance);

    const liquidityAmount1 = part1.mul(liquidityBalance).toString();
    const liquidityAmount2 = part2.mul(liquidityBalance).toString();

    const liquidityAmount = isExchangeB ? liquidityAmount2 : liquidityAmount1;

    try {
      await apiSora.poolXyk.remove(asset1, asset2, liquidityAmount, reserveA, reserveB, supply, slippage);
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
