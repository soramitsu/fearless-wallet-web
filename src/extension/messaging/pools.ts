import { type AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import type {
  PoolsParamsResponse,
  PoolsParamsRequest,
  MakePoolsRequest,
  GetShareOfPoolRequest,
} from '@extension-base/services/pools-service/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export function getPoolsParams(request: PoolsParamsRequest): Promise<PoolsParamsResponse> {
  return sendMessage('pri(pools.poolsParams)', request);
}

export function makePool(request: MakePoolsRequest): Promise<BasicTxResponse> {
  return sendMessage('pri(pools.makePool)', request);
}

export function getShareOfPool(request: GetShareOfPoolRequest): Promise<string> {
  return sendMessage('pri(pools.shareOfPool)', request);
}

export function unsubscribePools(): Promise<void> {
  return sendMessage('pri(pools.unsubscribePools)');
}

export async function subscribeAccountLiquidity(cb: (accountLiquidity: AccountLiquidity[]) => void): Promise<boolean> {
  return sendMessage('pri(pools.accountLiquidity)', null, cb);
}
