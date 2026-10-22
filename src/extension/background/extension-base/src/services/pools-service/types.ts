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
  assetKey: string;
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
  expectedFee: string;
}

export type RequestAddLiquidity = ActivityRequestSign<AddLiquidity>;

///////////////////////////////////////////////////////

export interface RemoveLiquidity extends DefaultParams {
  slippage: number;
  expectedFee: string;
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

export type DemeterOperation = 'deposit' | 'withdraw' | 'claim';

export type DemeterPoolAsset = {
  id: string;
  symbol: string;
  precision: number;
  icon: string;
};

export type DemeterPoolView = {
  key: string;
  baseAsset: DemeterPoolAsset;
  poolAsset: DemeterPoolAsset;
  rewardAsset: DemeterPoolAsset;
  isFarm: boolean;
  isCore: boolean;
  isRemoved: boolean;
  multiplier: string;
  depositFee: string;
  totalTokensInPool: string;
  rewards: string;
  rewardsToBeDistributed: string;
  tokenPerBlock: string | null;
  tvl: string | null;
  apr: string | null;
  pooledTokens: string;
  earnedRewards: string;
};

export type DemeterPoolsResponse = {
  available: boolean;
  reason?: string;
  canSign: boolean;
  signReason?: string;
  fees: Record<DemeterOperation, string>;
  pools: DemeterPoolView[];
};

export type DemeterMutationRequest = {
  operation: DemeterOperation;
  pool: Pick<DemeterPoolView, 'key' | 'isFarm'> & {
    baseAssetId: string;
    poolAssetId: string;
    rewardAssetId: string;
  };
  amount?: string;
  expectedFee: string;
};
