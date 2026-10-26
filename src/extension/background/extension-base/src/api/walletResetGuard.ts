import type State from '@extension-base/background/handlers/State';

export class WalletResetContextChanged extends Error {
  constructor() { super('Wallet changed during transfer. Start again after unlocking.'); }
}

/** Capture before the first await or secret read. A reset, lock, or new
 * authentication invalidates captured signing keys, even after a later unlock. */
export function captureWalletResetGuard(state: State): () => void {
  const keyring = state.keyringService;
  const revision = keyring.walletResetRevision ?? 0;
  const authenticationRevision = keyring.walletAuthenticationRevision ?? 0;
  const assertCurrent = () => {
    // This getter also checks absolute expiry when a sleeping browser delayed the timer.
    // Wallets without a local master password remain available for external signing.
    if (keyring.keyringIsLocked || state.keyringService !== keyring || keyring.isResetting ||
      (keyring.walletResetRevision ?? 0) !== revision ||
      (keyring.walletAuthenticationRevision ?? 0) !== authenticationRevision)
      throw new WalletResetContextChanged();
  };
  assertCurrent();
  return assertCurrent;
}
