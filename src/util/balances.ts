import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AccountBalance } from '@/interfaces';
import type { u128 } from '@polkadot/types-codec';
import { FPNumber } from '@/sora/number';

type OrmlAccountData = {
  free?: AccountData['free'];
  reserved?: AccountData['reserved'];
  frozen?: AccountData['free'];
};

/**
 * `transferable` is free minus (frozen + reserved). Free already excludes reserved, so reserved is subtracted twice,
 * and the existential deposit is not considered. Both make it an underestimate, which is kept on purpose: send and
 * fee checks built on it can only refuse too early, never let a transfer exceed what the account can move. Keep-alive
 * and the existential deposit are handled by the transfer forms.
 */
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
