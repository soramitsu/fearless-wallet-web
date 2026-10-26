import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), disconnect: vi.fn(), stopDisconnect: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ subscribeMessage: mocks.subscribe, watchBackgroundDisconnect: mocks.disconnect }));
import { watchWalletLock } from '@/bootstrap/walletLock';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue({ response: Promise.resolve(true), unsubscribe: mocks.unsubscribe });
  mocks.disconnect.mockReturnValue(mocks.stopDisconnect);
});

describe('open-wallet lock notification', () => {
  it('discards the view on a lock transition, without reloading an initially locked page', async () => {
    const discardView = vi.fn();
    const stop = watchWalletLock(discardView);
    await Promise.resolve();
    expect(discardView).not.toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalledWith('pri(keyring.subscribeLock)', null, expect.any(Function));
    mocks.subscribe.mock.calls[0][2](true);
    mocks.disconnect.mock.calls[0][0]();
    expect(discardView).toHaveBeenCalledOnce();
    stop();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.stopDisconnect).toHaveBeenCalledOnce();
  });

  it('handles a failed subscription without an unhandled rejection or reload loop', async () => {
    mocks.subscribe.mockReturnValue({ response: Promise.reject(new Error('background unavailable')), unsubscribe: mocks.unsubscribe });
    const discardView = vi.fn();
    watchWalletLock(discardView);
    await Promise.resolve();
    expect(discardView).not.toHaveBeenCalled();
  });
});
