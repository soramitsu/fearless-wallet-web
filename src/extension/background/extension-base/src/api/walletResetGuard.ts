import type State from '@extension-base/background/handlers/State';

export class WalletResetContextChanged extends Error {
  constructor() { super('Wallet changed during transfer. Start again after unlocking.'); }
}

/** Capture before the first await or secret read. A completed or failed reset
 * still invalidates work admitted under the earlier wallet revision. */
export function captureWalletResetGuard(state: State): () => void {
  const keyring = state.keyringService;
  const revision = keyring.walletResetRevision ?? 0;
  const assertCurrent = () => {
    if (state.keyringService !== keyring || keyring.isResetting || (keyring.walletResetRevision ?? 0) !== revision)
      throw new WalletResetContextChanged();
  };
  assertCurrent();
  return assertCurrent;
}
