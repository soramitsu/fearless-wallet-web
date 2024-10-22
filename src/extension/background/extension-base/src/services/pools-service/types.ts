import { type ActivityRequestSign } from '../../background/types/types';
import { type PoolsOperation } from '@/interfaces/pools';
import { type NetworkName } from '@/interfaces';

export interface MyPoolsInfo {
  test: string;
}

export interface DefaultParams {
  assetId1: string;
  assetId2: string;
  amount1: string;
  amount2: string;
  networkName: NetworkName;
  isExchangeB: boolean;
}

export interface AssetPool {
  name: string;
  icon: string;
  id: string;
  reserve: string;
  tokenBalance: string;
}

export interface DefaultPoolsParams {
  network: NetworkName;
  tvl: string;
  rewardAsset: string;
  isMyPool: boolean;
  yourShare?: string;
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
