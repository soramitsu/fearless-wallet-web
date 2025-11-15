import { type ActivityRequestSign, type BaseRequestSign } from '../../background/types/types';
import type { APIItemState } from '@extension-base/api/types/networks';
import { type PoolsOperation } from '@/interfaces/pools';
import { type NetworkName } from '@/interfaces';

export interface MyPoolsInfo {
  test: string;
}

export interface DefaultParams extends BaseRequestSign {
  assetId1: string;
  assetId2: string;
  amount1: string;
  amount2: string;
  networkName: NetworkName;
  isExchangeB: boolean;
}

export interface AssetPool {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  icon: string;
  color: string;
  reserve: string;
  tokenBalance: string;
  transferableAmount: string;
  totalAmount: string;
  priceId: string;
  balanceState: APIItemState;
  decimals: number;
}

export interface DefaultPoolsParams {
  poolId: string;
  network: NetworkName;
  tvl: string;
  rewardAsset: string;
  isMyPool: boolean;
  yourShare?: string;
  updatedAt: number;
  asset1: AssetPool;
  asset2: AssetPool;
}

export type PoolsParamsRequest = {
  networks: NetworkName[];
};

export type PoolsParamsResponse = DefaultPoolsParams[];

///////////////////////////////////////////////////////

export interface AddLiquidity extends DefaultParams {
  slippage: number;
}

export type RequestAddLiquidity = ActivityRequestSign<AddLiquidity>;

///////////////////////////////////////////////////////

export interface RemoveLiquidity extends DefaultParams {
  slippage: number;
}

export type RequestRemoveLiquidity = ActivityRequestSign<RemoveLiquidity>;

///////////////////////////////////////////////////////

export type RequestPool = RequestAddLiquidity | RequestRemoveLiquidity;

export type MakePoolsRequest = {
  params: RequestPool;
  type: PoolsOperation;
};

export interface GetShareOfPoolRequest extends DefaultParams {
  type: 'addLiquidity' | 'removeLiquidity';
}

export type GetShareOfPoolResponse = string;
