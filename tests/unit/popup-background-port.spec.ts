import { beforeEach, expect, it, vi } from 'vitest';
import { PORT_EXTENSION } from '@extension-base/defaults';

const mocks = vi.hoisted(() => {
  const ports: Array<{
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: Array<() => void>;
    onDisconnect: { addListener: (listener: () => void) => void };
    onMessage: { addListener: () => void };
  }> = [];
  const connect = vi.fn(() => {
    const disconnect: Array<() => void> = [];
    const port = {
      postMessage: vi.fn(),
      disconnect,
      onDisconnect: { addListener: (listener: () => void) => disconnect.push(listener) },
      onMessage: { addListener: () => undefined },
    };
    ports.push(port);
    return port;
  });
  return { connect, ports, connectionsAtStart: [] as number[] };
});

vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { connect: mocks.connect } } }));
vi.mock('@/appearance/visualEffects', () => ({ installVisualEffects: vi.fn(), extensionPreferenceStore: vi.fn() }));
vi.mock('@/bootstrap/startup', () => ({
  startWallet: vi.fn(() => {
    mocks.connectionsAtStart.push(mocks.connect.mock.calls.length);
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.connect.mockClear();
  mocks.ports.length = 0;
  mocks.connectionsAtStart.length = 0;
});

it('connects to the background before loading the wallet, and the wallet sends on that connection', async () => {
  await import('@/extension/entry/popup');

  // The connection that starts a stopped service worker exists before the wallet's code is requested.
  expect(mocks.connectionsAtStart).toEqual([1]);
  expect(mocks.connect).toHaveBeenCalledExactlyOnceWith({ name: PORT_EXTENSION });

  const { sendMessage } = await import('@/extension/messaging');
  void sendMessage('pri(app.port.ping)');

  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.ports[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'pri(app.port.ping)' }));
});

it('connects again when the first connection closed before the wallet loaded', async () => {
  await import('@/extension/entry/popup');
  mocks.ports[0].disconnect.forEach((listener) => listener());

  const { sendMessage } = await import('@/extension/messaging');
  void sendMessage('pri(app.port.ping)');

  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(mocks.ports[0].postMessage).not.toHaveBeenCalled();
  expect(mocks.ports[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'pri(app.port.ping)' }));
});
