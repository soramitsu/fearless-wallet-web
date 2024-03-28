import type {
  PoolsParamsResponse,
  PoolsParamsRequest,
  PoolsNetworkRequest,
  MyPoolsInfoResponse,
} from '@extension-base/services/pools-service/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getPoolsParams(request: PoolsParamsRequest): Promise<PoolsParamsResponse> {
  return sendMessage('pri(pools.poolsParams)', request);
}

export function getMyPoolsInfo(request: PoolsNetworkRequest): Promise<MyPoolsInfoResponse> {
  return sendMessage('pri(pools.myPools)', request);
}
