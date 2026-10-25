import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({
  post: vi.fn(),
  receive: undefined as unknown as (data: unknown) => void,
  sequence: 0,
}));
vi.mock('@extension-base/utils/utils', () => ({ getId: () => `public-${++transport.sequence}` }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: {
      connect: () => ({
        postMessage: transport.post,
        onDisconnect: { addListener: vi.fn() },
        onMessage: {
          addListener: (callback: (data: unknown) => void) => {
            transport.receive = callback;
          },
        },
      }),
    },
  },
}));
import { sendMessage, subscribeMessage } from '@/extension/messaging';
beforeEach(() => {
  transport.post.mockClear();
});
describe('window subscription cleanup', () => {
  it('preserves ordinary request response delivery', async () => {
    const response = sendMessage('pri(walletConnect.app.cancelPairing)', 'public-attempt');
    const { id } = transport.post.mock.calls[0][0];
    transport.receive({ id, response: true });
    await expect(response).resolves.toBe(true);
  });
  it('delivers subscription data before and after acknowledgement, then releases the callback', async () => {
    const callback = vi.fn();
    const pending = subscribeMessage('pri(walletConnect.app.subscribePairing)', 'wc:public-fixture', callback);
    const { id } = transport.post.mock.calls[0][0];
    transport.receive({ id, subscription: { status: true } });
    expect(callback).toHaveBeenCalledOnce();
    transport.receive({ id, response: { uri: 'wc:public-fixture' } });
    await expect(pending.response).resolves.toEqual({ uri: 'wc:public-fixture' });
    transport.receive({ id, subscription: { status: false } });
    expect(callback).toHaveBeenCalledTimes(2);
    pending.unsubscribe();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    transport.receive({ id, subscription: { status: true } });
    expect(callback).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('rejects a failed subscription acknowledgement and permits local cleanup', async () => {
    const pending = subscribeMessage('pri(walletConnect.app.subscribePairing)', 'wc:public-fixture', vi.fn());
    const failed = expect(pending.response).rejects.toThrow('public failure');
    transport.receive({ id: transport.post.mock.calls[0][0].id, error: 'public failure' });
    await failed;
    pending.unsubscribe();
  });
});
