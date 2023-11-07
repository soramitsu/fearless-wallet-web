import { FPNumber } from '@sora-substrate/util';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { AccountBalance } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function formatBalance(data: AccountData | OrmlAccountData | u128, assetDecimals: number): AccountBalance {
  const free = new FPNumber((data as AccountData)?.free ?? 0, assetDecimals);
  const reserved = new FPNumber((data as AccountData)?.reserved ?? 0, assetDecimals);

  const miscFrozen = new FPNumber((data as AccountData).miscFrozen ?? 0, assetDecimals);
  const feeFrozen = new FPNumber((data as AccountData).feeFrozen ?? 0, assetDecimals);
  const _frozen = new FPNumber((data as OrmlAccountData).frozen ?? 0, assetDecimals);

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
/* eslint-enable @typescript-eslint/no-explicit-any */
