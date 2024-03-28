import { type PasswordRequestSign } from '../../background/types/types';
import { type PoolsOperation } from '@/interfaces/pools';
import { type NetworkName } from '@/interfaces';

export interface MyPoolsInfo {
  test: string;
}

export interface AssetPool {
  name: string;
  icon: string;
  id: string;
  amount: string;
  myAmount: string;
}

export interface DefaultPoolsParams {
  network: NetworkName;
  apr: number;
  tvl: string;
  isMyPool: true;
  asset1: AssetPool;
  asset2: AssetPool;
}

export type PoolsParamsRequest = {
  networks: NetworkName[];
};

export type PoolsParamsResponse = DefaultPoolsParams[];

export type MyPoolsRequest = {
  network: NetworkName;
};

export type MyPoolsInfoResponse = MyPoolsInfo;

///////////////////////////////////////////////////////

export interface AddLiquidity {
  networkName: NetworkName;
  assetId1: string;
  assetId2: string;
  amount1: string;
  amount2: string;
  slippage: string;
}

export type RequestAddLiquidity = PasswordRequestSign<AddLiquidity>;

///////////////////////////////////////////////////////

export interface RemoveLiquidity {
  networkName: NetworkName;
  assetId1: string;
  assetId2: string;
  amount1: string;
  amount2: string;
  desiredMarker: string;
  supply: string;
  slippage: string;
}

export type RequestRemoveLiquidity = PasswordRequestSign<RemoveLiquidity>;

///////////////////////////////////////////////////////

export type RequestPool = RequestAddLiquidity | RequestRemoveLiquidity;

export type MakePoolsRequest = {
  params: RequestPool;
  type: PoolsOperation;
};
