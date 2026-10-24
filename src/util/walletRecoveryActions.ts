import { decodeAddress } from '@polkadot/util-crypto';
import { u8aEq } from '@polkadot/util';
import { assertWalletAllowsNormalUse } from '@/util/walletRecoveryPolicy';
import { isRecoveryOnlyWallet } from '@/util/walletSecurity';

type StoredWallets = Parameters<typeof assertWalletAllowsNormalUse>[0];

export const isRecoveryStakingAction = (action: unknown): boolean =>
  action === 'unbond' || action === 'redeem' || action === 'payoutRewards';
export const isRecoveryPoolAction = (action: unknown): boolean => action === 'removeLiquidity';
export const isRecoveryDemeterAction = (action: unknown): boolean => action === 'withdraw' || action === 'claim';
export const isRecoveryPolkamarktAction = (action: unknown): boolean =>
  action === 'sell' || action === 'claimMarket' || action === 'claimCreatorFees';

function samePrimaryAddress(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  try { return u8aEq(decodeAddress(left), decodeAddress(right)); } catch { return false; }
}

/** Recovery exits use the actual stored SORA signer, including SS58 variants. */
export function assertWalletAllowsRecoveryAction(accounts: StoredWallets, address: string, recoveryAction: boolean): void {
  if (recoveryAction && accounts.some((account) => samePrimaryAddress(account.address, address))) return;
  // Preserve the normal policy for unknown signers and every non-exit action.
  assertWalletAllowsNormalUse(accounts, address);
}

export function isStoredWalletRecoveryOnly(accounts: StoredWallets, address: string): boolean {
  return accounts.some((account) => samePrimaryAddress(account.address, address) && isRecoveryOnlyWallet(account.meta));
}
