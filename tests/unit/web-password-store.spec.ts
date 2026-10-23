import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function bridge() {
  let listener!: (event: unknown) => void;
  vi.stubGlobal('navigator', {
    serviceWorker: {
      addEventListener: (_: string, callback: typeof listener) => {
        listener = callback;
      },
    },
  });
  const { installWebPasswordStorage } = await import('@/bootstrap/webPasswordStore');
  installWebPasswordStorage();
  const reply = vi.fn();
  const close = vi.fn();
  const send = (
    operation: string,
    value?: string,
    scriptURL = new URL('/src/extension/entry/background-web.ts', location.href).href
  ) => {
    listener({
      data: { channel: 'fearless.web.password-store', operation, value },
      source: { scriptURL },
      ports: [{ postMessage: reply, close }],
    });
  };
  return { send, reply, close };
}

describe('web password storage bridge', () => {
  it('preserves the existing record and key across read, write, and removal', async () => {
    const { send, reply } = await bridge();
    const record = JSON.stringify({ passwordHash: { test: 'encrypted-fixture' } });
    localStorage.setItem('unrelated', 'keep');
    send('set', record);
    expect(localStorage.getItem('fw:keyring')).toBe(record);
    send('get');
    expect(reply).toHaveBeenLastCalledWith({ value: record });
    send('remove');
    send('get');
    expect(reply).toHaveBeenLastCalledWith({ value: null });
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
  it('ignores requests from a different worker and rejects unsupported operations', async () => {
    const { send, reply } = await bridge();
    send('get', undefined, 'https://unrelated.example/service-worker.js');
    expect(reply).not.toHaveBeenCalled();
    send('clear');
    expect(reply).toHaveBeenCalledWith({ error: 'Wallet storage is unavailable.' });
  });
});

it('discovers a listening wallet when the focused same-origin window has no bridge', async () => {
  class Port {
    onmessage?: (event: { data: unknown }) => void;
    peer!: Port;
    close = vi.fn();
    postMessage(data: unknown) { queueMicrotask(() => this.peer.onmessage?.({ data })); }
  }
  class Channel {
    port1 = new Port();
    port2 = new Port();
    constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; }
  }
  vi.stubGlobal('MessageChannel', Channel);
  const silentWindow = { url: 'http://localhost/unrelated', focused: true, postMessage: vi.fn() };
  const walletWindow = {
    url: 'http://localhost/', focused: false,
    postMessage: vi.fn(({ operation }: { operation: string }, [port]: Port[]) => {
      port.postMessage({ value: operation === 'ready' ? 'fearless.web.password-store' : null });
    }),
  };
  vi.stubGlobal('clients', { matchAll: vi.fn().mockResolvedValue([silentWindow, walletWindow]) });
  const { requestWebPasswordStorage } = await import('@/bootstrap/webPasswordStore');
  await expect(requestWebPasswordStorage('set', 'encrypted-fixture')).resolves.toBe(null);
  expect(silentWindow.postMessage).toHaveBeenCalledTimes(1);
  expect(silentWindow.postMessage.mock.calls[0][0].operation).toBe('ready');
  expect(walletWindow.postMessage.mock.calls.map(([data]) => data.operation)).toEqual(['ready', 'set']);
});
