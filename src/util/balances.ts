import { FPNumber } from '@sora-substrate/math';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { AccountBalance } from '@/interfaces/balances';
// import { FPNumber } from '@/util/fp';

export function formatBalance(data: AccountData | OrmlAccountData, assetDecimals?: number): AccountBalance {
  const free = new FPNumber(data.free || 0, assetDecimals);
  const reserved = new FPNumber(data.reserved || 0, assetDecimals);
  const miscFrozen = new FPNumber((data as AccountData).miscFrozen || 0, assetDecimals);
  const feeFrozen = new FPNumber((data as AccountData).feeFrozen || 0, assetDecimals);
  const frozen = new FPNumber((data as OrmlAccountData).frozen || 0, assetDecimals);
  const locked = FPNumber.max(miscFrozen, feeFrozen)!;
  const freeAndReserved = free.add(reserved);

  return {
    reserved: reserved.toCodecString(),
    locked: locked.toCodecString(),
    total: freeAndReserved.toCodecString(),
    transferable: free.sub(locked).toCodecString(),
    frozen: (frozen.isZero() ? locked.add(reserved) : frozen).toCodecString(),
  } as AccountBalance;
}
