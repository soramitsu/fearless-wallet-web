export const CURRENT_WALLET_SECURITY_GENERATION = 1;
export const WALLET_GENERATION_EXPIRED_ERROR = 'wallet_generation_expired';

export function isWalletGenerationExpired(error: unknown): boolean {
  return error instanceof Error && error.message.includes(WALLET_GENERATION_EXPIRED_ERROR);
}
