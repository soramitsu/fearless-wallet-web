/** Thrown when an account's key is still encrypted with its own pre-2.7.1 password. */
export const LEGACY_PASSWORD_REQUIRED = 'legacy_password_required';
/** Thrown when an account's key opens only with a master password used before. */
export const PREVIOUS_PASSWORD_REQUIRED = 'previous_password_required';
/** Thrown when a TON phrase opens only with a master password used before. */
export const TON_SEED_NEEDS_PREVIOUS_PASSWORD = 'ton_seed_needs_previous_password';

const ACCOUNT_ACCESS_ERRORS = new Set([LEGACY_PASSWORD_REQUIRED, PREVIOUS_PASSWORD_REQUIRED, TON_SEED_NEEDS_PREVIOUS_PASSWORD]);

/** The account is in the wallet but locked until the user enters the password or phrase that opens it
 * (Account access). Balances and receiving keep working; signing and export wait. */
export function isAccountAccessError(error: unknown): boolean {
  return error instanceof Error && ACCOUNT_ACCESS_ERRORS.has(error.message);
}
