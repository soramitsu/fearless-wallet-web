import { api as apiSora, type CodecString, FPNumber } from '@sora-substrate/util';
import { BasicTxErrorCode, type BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import { getSoraAsset } from '@extension-base/api/substrate/sora';
import { type u128 } from '@polkadot/types';
import { type AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import {
  type GetShareOfPoolRequest,
  type RequestAddLiquidity,
  type PoolsParamsResponse,
  type MakePoolsRequest,
  type RequestRemoveLiquidity,
  type MyPoolsInfo,
  type PoolsParamsRequest,
  type DefaultPoolsParams,
  type DefaultParams,
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
}

export class PoolsService {
  userPoolsSubscription: Subscription | null = null;

  constructor(private state: State) {}

  public async getPoolsParams(params: PoolsParamsRequest): Promise<PoolsParamsResponse> {
    const { networks } = params;

    if (this.userPoolsSubscription === null) this.userPoolsSubscription = apiSora.poolXyk.getUserPoolsSubscription();

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

  public unsubscribePools(): void {
    this.userPoolsSubscription?.unsubscribe();
  }

  public async getMyPoolsInfo(network: NetworkName): Promise<MyPoolsInfo> {
    const address = this.state.getCurrentAddress(network);

    return { test: '' };
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
        apr: 0, // TODO
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
    const accountLiquidity = apiSora.poolXyk.accountLiquidity;

    return accountLiquidity.find(
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
    };
  }

  public getLiquidityAmount(): FPNumber {
    return FPNumber.ZERO;
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

    const minted = await this.getMinted(poolInfo, totalSupply);
    const total = FPNumber.fromCodecValue(totalSupply);
    const existed = FPNumber.fromCodecValue(balance);

    if (total.isZero() && minted.isZero()) return FPNumber.HUNDRED.toLocaleString();

    return minted.add(existed).div(total.add(minted)).mul(FPNumber.HUNDRED).toLocaleString() || '0';
  }

  public getShareOfPoolByRemoveLiquidity(params: GetShareOfPoolRequest): string {
    const { balance, supply } = this.getPoolInfo(params);

    const existed = FPNumber.fromCodecValue(balance);
    const removed = this.getLiquidityAmount(); // TODO количество удаляемых токенов??
    const totalSupply = FPNumber.fromCodecValue(supply);
    const totalSupplyAfter = totalSupply.sub(removed);

    if (existed.isZero() || totalSupply.isZero() || totalSupplyAfter.isZero()) return '0';

    return existed.sub(removed).div(totalSupplyAfter).mul(FPNumber.HUNDRED).toLocaleString() || '0';
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
    const { amount1, amount2, slippage } = params;
    const { asset1, asset2, supply } = this.getPoolInfo(params);

    const desiredMarker = this.getLiquidityAmount().toString();

    try {
      await apiSora.poolXyk.remove(asset1, asset2, desiredMarker, amount1, amount2, supply, slippage);
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
