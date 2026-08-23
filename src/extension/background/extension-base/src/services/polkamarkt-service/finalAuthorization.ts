import type { PolkamarktFinalAuthorizationContext } from '.';
import { isCapturedSoraPairStillSelected, type SoraPairBinding } from '@/defi/soraAccountBinding';

type AddressFormatter = (address: string) => string;

export interface PolkamarktFinalAuthorizationGuardOptions {
  capturedAccountAddress: string;
  capturedPair: SoraPairBinding | undefined;
  capturedRuntime: unknown;
  isActionEnabled: () => boolean;
  isDisclaimerAccepted: () => boolean;
  isRuntimeReady: () => Promise<boolean>;
  getCurrentPair: () => SoraPairBinding | undefined;
  getCurrentRuntime: () => unknown;
  getSelectedAddress: () => string;
  isSubmitAvailable: () => boolean;
  unlockPair: (address: string) => boolean;
  formatAddress: AddressFormatter;
  onAuthorized: () => void;
}

function assertCurrentBackgroundState(
  options: PolkamarktFinalAuthorizationGuardOptions,
  context: PolkamarktFinalAuthorizationContext
): string {
  if (!options.isActionEnabled()) {
    throw new Error('Polkamarkt actions are temporarily paused.');
  }
  if (!options.isDisclaimerAccepted()) {
    throw new Error('Accept the Polkaswap and SORA risk disclaimer first.');
  }
  if (
    !options.capturedRuntime ||
    options.getCurrentRuntime() !== options.capturedRuntime ||
    !options.isSubmitAvailable()
  ) {
    throw new Error('The SORA runtime changed or is unavailable. Review the action again.');
  }
  if (context.accountAddress !== options.capturedAccountAddress) {
    throw new Error('The selected SORA account changed. Review the action again.');
  }

  const selectedAddress = options.getSelectedAddress();
  if (
    !isCapturedSoraPairStillSelected(
      options.capturedPair,
      options.getCurrentPair(),
      selectedAddress,
      options.formatAddress
    )
  ) {
    throw new Error('The selected SORA account changed. Review the action again.');
  }

  return selectedAddress;
}

/**
 * Runs in the extension background immediately before submission. Runtime
 * validation is repeated after unlocking because either operation may yield
 * while remote policy, selected account, or the SORA connection changes.
 */
export function createPolkamarktFinalAuthorizationGuard(
  options: PolkamarktFinalAuthorizationGuardOptions
): (context: PolkamarktFinalAuthorizationContext) => Promise<void> {
  return async (context) => {
    assertCurrentBackgroundState(options, context);
    if (!(await options.isRuntimeReady())) {
      throw new Error('The SORA runtime changed or is unavailable. Review the action again.');
    }

    const selectedAddress = assertCurrentBackgroundState(options, context);
    if (!options.unlockPair(selectedAddress)) {
      throw new Error('Unlock the selected SORA account and try again.');
    }

    if (!(await options.isRuntimeReady())) {
      throw new Error('The SORA runtime changed or is unavailable. Review the action again.');
    }
    assertCurrentBackgroundState(options, context);
    options.onAuthorized();
  };
}
