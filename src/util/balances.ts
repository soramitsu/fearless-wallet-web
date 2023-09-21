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
  const frozen = new FPNumber((data as OrmlAccountData).frozen ?? 0, assetDecimals);
  const locked = FPNumber.max(miscFrozen, feeFrozen, frozen)!;
  const freeAndReserved = free.add(reserved);

  console.log('data', data?.toHuman());

  return {
    frozen: locked.toString(), // замороженный баланс, вроде как это стейкинг баланс ???
    reserved: reserved.toString(), // зарезервированный баланс (по сути это тоже залоченные токены, которые нельзя передавать)
    locked: locked.add(reserved).toString(), // общий заблокированый баланс
    transferable: free.sub(locked).toString(), // передаваемый баланс
    total: freeAndReserved.toString(), // общий баланс
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
