import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { u128 } from '@polkadot/types-codec';
import type { AccountBalance } from '@/interfaces';
import type { OrmlAccountDataLike } from '@/types/polkadot';
import { FPNumber } from '@/lib/fpNumber';

export function formatBalance(data: AccountData | OrmlAccountDataLike | u128, assetDecimals: number): AccountBalance {
  const free = new FPNumber((data as AccountData)?.free ?? 0, assetDecimals);
  const reserved = new FPNumber((data as AccountData)?.reserved ?? 0, assetDecimals);

  const miscFrozen = new FPNumber((data as AccountData).miscFrozen ?? 0, assetDecimals);
  const feeFrozen = new FPNumber((data as AccountData).feeFrozen ?? 0, assetDecimals);
  const _frozen = new FPNumber((data as OrmlAccountDataLike).frozen ?? 0, assetDecimals);

  const frozen = FPNumber.max(miscFrozen, feeFrozen, _frozen)!;
  const locked = frozen.add(reserved);
  const freeAndReserved = free.add(reserved);

  return {
    frozen: frozen.toString(),
    reserved: reserved.toString(),
    locked: locked.toString(),
    transferable: free.sub(locked).toString(),
    total: freeAndReserved.toString(),
  };
}
