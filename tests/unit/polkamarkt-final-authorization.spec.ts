import { describe, expect, it, vi } from 'vitest';

import type { PolkamarktFinalAuthorizationContext } from '@/extension/background/extension-base/src/services/polkamarkt-service';
import { createPolkamarktFinalAuthorizationGuard } from '@/extension/background/extension-base/src/services/polkamarkt-service/finalAuthorization';

const formatAddress = (address: string) => address.toLowerCase().replace(/^sora:/, '');
const context: PolkamarktFinalAuthorizationContext = {
  accountAddress: 'SORA:Alice',
  request: { action: 'claimMarket', marketId: '7', disclaimerAccepted: true },
  extrinsic: { kind: 'claimMarket' },
  networkFeeCodec: '1000000000000000',
};

function guardState() {
  const pair = { address: 'SORA:Alice', meta: {} };
  const runtime = {};

  return {
    pair,
    runtime,
    actionEnabled: true,
    disclaimerAccepted: true,
    currentPair: pair,
    currentRuntime: runtime,
    selectedAddress: 'alice',
    submitAvailable: true,
  };
}

describe('Polkamarkt final background authorization', () => {
  it('checks runtime on both sides of a successful unlock before authorizing', async () => {
    const state = guardState();
    const isRuntimeReady = vi.fn().mockResolvedValue(true);
    const unlockPair = vi.fn().mockReturnValue(true);
    const onAuthorized = vi.fn();
    const guard = createPolkamarktFinalAuthorizationGuard({
      capturedAccountAddress: context.accountAddress,
      capturedPair: state.pair,
      capturedRuntime: state.runtime,
      isActionEnabled: () => state.actionEnabled,
      isDisclaimerAccepted: () => state.disclaimerAccepted,
      isRuntimeReady,
      getCurrentPair: () => state.currentPair,
      getCurrentRuntime: () => state.currentRuntime,
      getSelectedAddress: () => state.selectedAddress,
      isSubmitAvailable: () => state.submitAvailable,
      unlockPair,
      formatAddress,
      onAuthorized,
    });

    await expect(guard(context)).resolves.toBeUndefined();
    expect(isRuntimeReady).toHaveBeenCalledTimes(2);
    expect(unlockPair).toHaveBeenCalledOnce();
    expect(unlockPair).toHaveBeenCalledWith('alice');
    expect(onAuthorized).toHaveBeenCalledOnce();
  });

  it('rejects a kill-switch change while the final runtime check is in flight', async () => {
    const state = guardState();
    const unlockPair = vi.fn().mockReturnValue(true);
    const guard = createPolkamarktFinalAuthorizationGuard({
      capturedAccountAddress: context.accountAddress,
      capturedPair: state.pair,
      capturedRuntime: state.runtime,
      isActionEnabled: () => state.actionEnabled,
      isDisclaimerAccepted: () => state.disclaimerAccepted,
      isRuntimeReady: vi.fn(async () => {
        state.actionEnabled = false;
        return true;
      }),
      getCurrentPair: () => state.currentPair,
      getCurrentRuntime: () => state.currentRuntime,
      getSelectedAddress: () => state.selectedAddress,
      isSubmitAvailable: () => state.submitAvailable,
      unlockPair,
      formatAddress,
      onAuthorized: vi.fn(),
    });

    await expect(guard(context)).rejects.toThrow('temporarily paused');
    expect(unlockPair).not.toHaveBeenCalled();
  });

  it('rejects disclaimer or account changes caused during unlock', async () => {
    const state = guardState();
    const onAuthorized = vi.fn();
    const guard = createPolkamarktFinalAuthorizationGuard({
      capturedAccountAddress: context.accountAddress,
      capturedPair: state.pair,
      capturedRuntime: state.runtime,
      isActionEnabled: () => state.actionEnabled,
      isDisclaimerAccepted: () => state.disclaimerAccepted,
      isRuntimeReady: vi.fn().mockResolvedValue(true),
      getCurrentPair: () => state.currentPair,
      getCurrentRuntime: () => state.currentRuntime,
      getSelectedAddress: () => state.selectedAddress,
      isSubmitAvailable: () => state.submitAvailable,
      unlockPair: vi.fn(() => {
        state.disclaimerAccepted = false;
        state.currentPair = { ...state.pair };
        return true;
      }),
      formatAddress,
      onAuthorized,
    });

    await expect(guard(context)).rejects.toThrow('disclaimer');
    expect(onAuthorized).not.toHaveBeenCalled();
  });

  it('fails closed when unlocking fails or the captured runtime is replaced', async () => {
    const locked = guardState();
    const unlockGuard = createPolkamarktFinalAuthorizationGuard({
      capturedAccountAddress: context.accountAddress,
      capturedPair: locked.pair,
      capturedRuntime: locked.runtime,
      isActionEnabled: () => true,
      isDisclaimerAccepted: () => true,
      isRuntimeReady: vi.fn().mockResolvedValue(true),
      getCurrentPair: () => locked.currentPair,
      getCurrentRuntime: () => locked.currentRuntime,
      getSelectedAddress: () => locked.selectedAddress,
      isSubmitAvailable: () => true,
      unlockPair: vi.fn().mockReturnValue(false),
      formatAddress,
      onAuthorized: vi.fn(),
    });
    await expect(unlockGuard(context)).rejects.toThrow('Unlock the selected SORA account');

    const replaced = guardState();
    replaced.currentRuntime = {};
    const runtimeGuard = createPolkamarktFinalAuthorizationGuard({
      capturedAccountAddress: context.accountAddress,
      capturedPair: replaced.pair,
      capturedRuntime: replaced.runtime,
      isActionEnabled: () => true,
      isDisclaimerAccepted: () => true,
      isRuntimeReady: vi.fn().mockResolvedValue(true),
      getCurrentPair: () => replaced.currentPair,
      getCurrentRuntime: () => replaced.currentRuntime,
      getSelectedAddress: () => replaced.selectedAddress,
      isSubmitAvailable: () => true,
      unlockPair: vi.fn().mockReturnValue(true),
      formatAddress,
      onAuthorized: vi.fn(),
    });
    await expect(runtimeGuard(context)).rejects.toThrow('runtime changed');
  });
});
