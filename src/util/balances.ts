import { FPNumber } from '@sora-substrate/math';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { AccountBalance } from '@/interfaces/balances';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function formatBalance(data: AccountData | OrmlAccountData, assetDecimals?: number): AccountBalance {
  const free = new FPNumber((data?.free || 0) as any, assetDecimals);
  const reserved = new FPNumber((data?.reserved || 0) as any, assetDecimals);
  const miscFrozen = new FPNumber(((data as AccountData).miscFrozen || 0) as any, assetDecimals);
  const feeFrozen = new FPNumber(((data as AccountData).feeFrozen || 0) as any, assetDecimals);
  const frozen = new FPNumber(((data as OrmlAccountData).frozen || 0) as any, assetDecimals);
  const locked = FPNumber.max(miscFrozen, feeFrozen)!;
  const freeAndReserved = free.add(reserved);

  return {
    reserved: reserved.toString(),
    locked: locked.toString(),
    total: freeAndReserved.toString(),
    transferable: free.sub(locked).toString(),
    frozen: (frozen.isZero() ? locked.add(reserved) : frozen).toString(),
  } as AccountBalance;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
