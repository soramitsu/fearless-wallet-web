export const CURRENT_WALLET_SECURITY_GENERATION = 1;
export const WALLET_GENERATION_EXPIRED_ERROR = 'wallet_generation_expired';

export function isWalletGenerationExpired(error: unknown): boolean {
  return error instanceof Error && error.message.includes(WALLET_GENERATION_EXPIRED_ERROR);
}

export type WalletSecurityMetadata = {
  walletSecurityGeneration?: unknown;
  isExternal?: unknown;
  isHardware?: unknown;
  isInjected?: unknown;
  isMobile?: unknown;
  isReadOnly?: unknown;
  isWatchOnly?: unknown;
  noPublicKey?: unknown;
};

/** Missing provenance includes every local wallet persisted before this update. */
export function isRecoveryOnlyWallet(account: WalletSecurityMetadata): boolean {
  if (account.isExternal || account.isHardware || account.isInjected || account.isMobile ||
    account.isReadOnly || account.isWatchOnly || account.noPublicKey) return false;
  return account.walletSecurityGeneration !== CURRENT_WALLET_SECURITY_GENERATION;
}
