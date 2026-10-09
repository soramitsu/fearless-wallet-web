import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION_SMOKE: false }));
import { SubscriptionService } from '@extension-base/services/subscription-service';

afterEach(() => vi.unstubAllGlobals());

describe('web wallet subscription delivery', () => {
  it('delivers account selection changes over the web channel and closes each sender', () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage = postMessage;
        close = close;
      }
    );
    const context = { subscriptionsPorts: {} };
    const send = SubscriptionService.prototype.createSubscription.call(context, 'window-a.accounts');
    const accounts = [{ address: 'public-fixture', active: true }];
    send(accounts);
    expect(postMessage).toHaveBeenCalledWith({ id: 'window-a.accounts', subscription: accounts });
    expect(close).toHaveBeenCalledOnce();
  });
  it('continues to use the existing extension port when supplied', () => {
    const port = { postMessage: vi.fn() };
    const send = SubscriptionService.prototype.createSubscription.call(
      { subscriptionsPorts: {} },
      'extension-id',
      port
    );
    send([]);
    expect(port.postMessage).toHaveBeenCalledWith({ id: 'extension-id', subscription: [] });
  });
});
