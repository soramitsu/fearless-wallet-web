import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PORT_CONTENT, PORT_EXTENSION } from '@extension-base/defaults';
import { QUIET_AFTER_MS, WorkerSleepService } from '@extension-base/services/worker-sleep-service';
import type { Port } from '@extension-base/background/types/types';

const WALLET = 'chrome-extension://walletextensionid/';

const mocks = vi.hoisted(() => ({
  state: undefined as unknown as Record<string, unknown>,
  handlers: undefined as unknown as (...args: unknown[]) => Promise<void>,
}));

vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { reload: () => undefined } } }));
vi.mock('@polkadot/util-crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@polkadot/util-crypto')>()),
  cryptoWaitReady: () => Promise.resolve(true),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: { keyring: { setupMasterPassword: () => undefined } } }));
vi.mock('@extension-base/background/handlers', () => ({
  handlers: (...args: unknown[]) => mocks.handlers(...args),
  // As the real check: the port's sender is a page of this extension.
  isWalletPagePort: (port: Port) => !!port.sender?.url?.startsWith(WALLET),
  state: new Proxy({}, { get: (_, key) => mocks.state[key as string] }),
}));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class { getAndWait() { return Promise.resolve(undefined); } } }));
vi.mock('@extension-base/stores/TonStore', () => ({ tonStore: { loaded: Promise.resolve() } }));
vi.mock('@extension-base/stores/Storage', () => ({ initStorage: () => Promise.resolve() }));
vi.mock('@extension-base/services/migration-service', () => ({ default: { start: () => undefined } }));
vi.mock('@/extension/toolbarSurface', () => ({ registerToolbarSurface: () => undefined }));

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

function event() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return { addListener: (listener: (...args: unknown[]) => void) => listeners.push(listener), emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)) };
}

// The extension worker: the real wake listeners and runtime, with the background state's network work replaced by a
// record of what was opened and closed.
async function startWorker() {
  vi.resetModules();
  const order: string[] = [];
  const host = {
    openWork: false,
    hasOpenWork: () => host.openWork,
    quiet: vi.fn(async () => { order.push('quiet'); }),
    restore: vi.fn(async () => { order.push('restore'); }),
  };
  const handled: string[] = [];
  const answers = new Map<string, Promise<void>>();
  mocks.handlers = async (data: unknown) => {
    const { id } = data as { id: string };
    order.push(`handle ${id}`);
    await answers.get(id);
    handled.push(id);
  };
  mocks.state = {
    keyringService: {
      loadAll: () => Promise.resolve(),
      tonKeyring: { loadAll: () => Promise.resolve() },
      currentAccountReady: Promise.resolve(),
      restoreCurrentAccount: () => Promise.resolve(),
    },
    eventService: { emit: () => true },
    legacyExposureService: { init: () => Promise.resolve() },
    ensureCurrentAccount: () => Promise.resolve(),
    workerSleepService: new WorkerSleepService(host, true),
    onWalletPageOpened: vi.fn(),
  };
  const { backgroundReady } = await import('@/extension/entry/backgroundRuntime');
  const { registerBackgroundListeners } = await import('@/extension/entry/backgroundBootstrap');
  const api = {
    runtime: { onConnect: event(), onInstalled: event(), onUpdateAvailable: event(), reload: vi.fn() },
    alarms: { get: vi.fn().mockResolvedValue(undefined), create: vi.fn(), onAlarm: event() },
  };
  registerBackgroundListeners(api as unknown as typeof chrome, backgroundReady);
  await backgroundReady;

  const open = (name: string, url: string) => {
    const port = { name, sender: { url, frameId: 0 }, onMessage: event(), onDisconnect: event(), postMessage: vi.fn() };
    api.runtime.onConnect.emit(port);
    return {
      send: (id: string, answer?: Promise<void>) => {
        if (answer) answers.set(id, answer);
        port.onMessage.emit({ id, message: 'request', request: null });
      },
      close: () => port.onDisconnect.emit(),
    };
  };
  const popup = () => open(PORT_EXTENSION, `${WALLET}popup.html`);
  const site = () => open(PORT_CONTENT, 'https://dapp.example/');
  const flush = () => vi.advanceTimersByTimeAsync(0);
  return { host, order, handled, popup, site, flush, state: mocks.state as { onWalletPageOpened: ReturnType<typeof vi.fn> } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the extension worker sleeping between uses', () => {
  it('opens the connections when the popup connects, before it asks anything, and closes them after it closes', async () => {
    const worker = await startWorker();

    const popup = worker.popup();
    await worker.flush();
    expect(worker.host.restore).toHaveBeenCalledOnce();

    popup.close();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS - 1);
    expect(worker.host.quiet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.host.quiet).toHaveBeenCalledOnce();
  });

  it('has a page that opens on an awake wallet read its balances again; a quiet wallet reads them as it reconnects', async () => {
    const worker = await startWorker();

    const first = worker.popup();
    await worker.flush();
    expect(worker.host.restore).toHaveBeenCalledOnce();
    expect(worker.state.onWalletPageOpened).not.toHaveBeenCalled();

    first.close();
    await vi.advanceTimersByTimeAsync(1_000);
    worker.popup();
    await worker.flush();
    expect(worker.host.restore).toHaveBeenCalledOnce();
    expect(worker.state.onWalletPageOpened).toHaveBeenCalledOnce();

    // A site's port is not a wallet page.
    worker.site();
    await worker.flush();
    expect(worker.state.onWalletPageOpened).toHaveBeenCalledOnce();
  });

  it('opens nothing for a site that only connected, and keeps them a minute after its last request', async () => {
    const worker = await startWorker();
    const tab = worker.site();
    await worker.flush();
    expect(worker.host.restore).not.toHaveBeenCalled();

    tab.send('eth_chainId');
    await worker.flush();
    expect(worker.order).toEqual(['restore', 'handle eth_chainId']);

    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS / 2);
    tab.send('eth_blockNumber');
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS - 1);
    expect(worker.host.quiet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.host.quiet).toHaveBeenCalledOnce();
  });

  it("answers a site's request only once the connections are open", async () => {
    const worker = await startWorker();
    const reconnected = deferred();
    worker.host.restore.mockImplementationOnce(async () => { await reconnected.promise; worker.order.push('restore'); });

    worker.site().send('eth_call');
    await worker.flush();
    expect(worker.handled).toEqual([]);

    reconnected.resolve();
    await worker.flush();
    expect(worker.order).toEqual(['restore', 'handle eth_call']);
    expect(worker.handled).toEqual(['eth_call']);
  });

  it("answers the popup's requests without waiting for the connections, as at start-up", async () => {
    const worker = await startWorker();
    worker.host.restore.mockImplementationOnce(() => new Promise(() => undefined));

    worker.popup().send('pri(keyring.keyringIsLocked)');
    await worker.flush();

    expect(worker.handled).toEqual(['pri(keyring.keyringIsLocked)']);
  });

  it("handles a site's request after 15 s when the connections do not open", async () => {
    const worker = await startWorker();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    worker.host.restore.mockImplementationOnce(() => new Promise(() => undefined));

    worker.site().send('eth_chainId');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(worker.handled).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(worker.handled).toEqual(['eth_chainId']);
    expect(warn).toHaveBeenCalledWith('Site request handled before the wallet reconnected', expect.any(Error));
  });
});

describe('the extension worker while its connections close', () => {
  async function closing() {
    const worker = await startWorker();
    const teardown = deferred();
    worker.host.quiet.mockImplementationOnce(async () => {
      worker.order.push('quiet');
      await teardown.promise;
      worker.order.push('quiet done');
    });
    worker.popup().close();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(worker.order).toEqual(['restore', 'quiet']);
    return { ...worker, finishTeardown: teardown.resolve };
  }

  it("holds a site's request until the teardown is over and the connections are open again", async () => {
    const worker = await closing();

    worker.site().send('eth_getBalance');
    await worker.flush();
    expect(worker.handled).toEqual([]);

    worker.finishTeardown();
    await worker.flush();

    expect(worker.order).toEqual(['restore', 'quiet', 'quiet done', 'restore', 'handle eth_getBalance']);
  });

  it('opens them again for a popup that connects during the teardown, once it is over', async () => {
    const worker = await closing();

    worker.popup();
    await worker.flush();
    expect(worker.host.restore).toHaveBeenCalledOnce();

    worker.finishTeardown();
    await worker.flush();
    expect(worker.order).toEqual(['restore', 'quiet', 'quiet done', 'restore']);

    // The popup is open: nothing closes.
    await vi.advanceTimersByTimeAsync(10 * QUIET_AFTER_MS);
    expect(worker.host.quiet).toHaveBeenCalledOnce();
  });

  it('keeps them through an eth_sendTransaction approval whose window closed while the wallet sends it', async () => {
    const worker = await startWorker();
    const sent = deferred();
    // The site's request is answered with the hash once the approval has sent the transaction.
    worker.site().send('eth_sendTransaction', sent.promise);
    worker.host.openWork = true;
    const approvalWindow = worker.popup();
    await worker.flush();

    approvalWindow.send('pri(signing.approve)', sent.promise);
    await worker.flush();
    expect(worker.order).toContain('handle pri(signing.approve)');
    approvalWindow.close();
    worker.host.openWork = false;
    await vi.advanceTimersByTimeAsync(5 * QUIET_AFTER_MS);
    expect(worker.host.quiet).not.toHaveBeenCalled();

    sent.resolve();
    await worker.flush();
    expect(worker.handled).toEqual(['eth_sendTransaction', 'pri(signing.approve)']);
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(worker.host.quiet).toHaveBeenCalledOnce();
  });
});
