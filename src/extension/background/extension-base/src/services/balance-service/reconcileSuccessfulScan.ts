import { APIItemState } from '@extension-base/api/types/networks';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import { isSameString } from '@/helpers';

type SuccessfulScanReconciliation = {
  address: string;
  network: string;
  observedAssetIds: Iterable<string>;
  includes: (item: BalanceItem) => boolean;
};

/**
 * A failed scan retains the last known snapshot elsewhere. Once a scan has
 * completed successfully, however, omission is authoritative for dynamic
 * holdings: an asset that disappeared from the complete response now has a
 * zero balance. Keep its metadata/preference tombstone, but never keep a
 * phantom positive holding.
 */
export function reconcileSuccessfulDynamicScan(
  state: State,
  { address, network, observedAssetIds, includes }: SuccessfulScanReconciliation
): BalanceItem[] {
  const observed = new Set(observedAssetIds);
  const normalizedAddress = state.keyringService?.getSubstrateAddress?.(address) ?? address;
  const mapAddress = state.balanceService.balanceMap[address] ? address : normalizedAddress;
  const groups = state.balanceService.balanceMap[mapAddress] ?? [];
  const reconciled: BalanceItem[] = [];

  groups.forEach((group) => {
    group.balances.forEach((existing, index) => {
      const belongsToNetwork = isSameString(existing.name, network) ||
        isSameString(existing.mainNetwork, network);

      if (!belongsToNetwork || !includes(existing) || observed.has(existing.id)) return;

      const balance: BalanceItem = {
        ...existing,
        free: '0',
        reserved: '0',
        locked: '0',
        miscFrozen: '0',
        frozen: '0',
        total: '0',
        transferable: '0',
        muchTotal: '0',
        state: APIItemState.READY,
        timestamp: Date.now(),
        solanaTokenAccountAddress: undefined,
        solanaTokenAccountAddresses: undefined,
        solanaTokenSourceAmount: existing.type === 'solana' ? '0' : existing.solanaTokenSourceAmount,
      };

      group.balances[index] = balance;
      reconciled.push(balance);
      state.balanceService.updateBalanceStore(network, balance, mapAddress);
    });
  });

  return reconciled;
}
