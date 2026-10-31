import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import type { Mock } from 'vitest';

type Listener = (...args: unknown[]) => void;
type Posted = { id: string; message: string };

const event = () => {
  const listeners: Listener[] = [];

  return {
    listeners,
    addListener: (listener: Listener) => listeners.push(listener),
    removeListener: (listener: Listener) => listeners.splice(listeners.indexOf(listener) >>> 0, 1),
    emit: (...args: unknown[]) => [...listeners].forEach((listener) => listener(...args)),
  };
};

const createPort = () => ({
  name: PORT_CONTENT,
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: event(),
  onDisconnect: event(),
});

type FakePort = ReturnType<typeof createPort>;

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: {
      connect: mocks.connect,
      getURL: (path: string) => `chrome-extension://walletextensionid/${path}`,
    },
  },
}));

let ports: FakePort[];
let toPage: Mock<(message: unknown, options?: unknown) => void>;
let prerendering: boolean;
const added: [EventTarget, string, EventListenerOrEventListenerObject][] = [];

const PORT_LOST = 'Connection to Fearless Wallet was lost. Check the wallet for an open request before you try again.';

const fromPage = (id: string, message = 'pub(accounts.list)') => {
  const data = { id, message, origin: MESSAGE_ORIGIN_PAGE, request: null };

  window.dispatchEvent(new MessageEvent('message', { data, source: window }));

  return data;
};

const pageShow = (persisted: boolean) => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));

const loadContentScript = async () => {
  vi.resetModules();
  await import('@/extension/entry/content');
};

const setUp = (mockPagePost: boolean) => {
  ports = [];
  prerendering = false;
  mocks.connect.mockReset().mockImplementation(() => {
    const port = createPort();

    ports.push(port);

    return port;
  });
  toPage = vi.fn();
  // The test DOM names another object as the source of window.postMessage; post as a browser does.
  vi.spyOn(window, 'postMessage').mockImplementation(
    mockPagePost
      ? toPage
      : (data: unknown) => {
        setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: structuredClone(data), source: window })));
      }
  );
  // The test DOM loads no scripts; keep the injected page script out of it.
  vi.spyOn(document.head, 'insertBefore').mockImplementation((node) => node);
  Object.defineProperty(document, 'prerendering', { configurable: true, get: () => prerendering });

  for (const target of [window, document]) {
    const addEventListener = target.addEventListener.bind(target);

    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      if (listener) added.push([target, type, listener]);
      addEventListener(type, listener, options);
    });
  }
};

const tearDown = () => {
  added.splice(0).forEach(([target, type, listener]) => target.removeEventListener(type, listener));
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'prerendering');
};

describe('content script port', () => {
  beforeEach(() => setUp(true));
  afterEach(tearDown);

  it('opens the port on the first page request, not at page load', async () => {
    await loadContentScript();

    expect(vi.mocked(document.head.insertBefore).mock.calls[0][0]).toMatchObject({
      src: 'chrome-extension://walletextensionid/page.js',
    });
    expect(mocks.connect).not.toHaveBeenCalled();

    const request = fromPage('request-1');
    const next = fromPage('request-2');

    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith({ name: PORT_CONTENT });
    expect(ports[0].postMessage.mock.calls).toEqual([[request], [next]]);
  });

  it('forwards page requests to the background and its answers to the page', async () => {
    await loadContentScript();

    const request = fromPage('request-1');

    expect(ports[0].postMessage).toHaveBeenCalledExactlyOnceWith(request);

    ports[0].onMessage.emit({ id: 'request-1', response: ['account'] });

    expect(toPage).toHaveBeenCalledExactlyOnceWith(
      { id: 'request-1', response: ['account'], origin: MESSAGE_ORIGIN_CONTENT },
      '*'
    );
  });

  it('ignores messages that are not the page talking to the wallet', async () => {
    await loadContentScript();

    window.dispatchEvent(new MessageEvent('message', { data: { id: 'x', origin: 'elsewhere' }, source: window }));
    window.dispatchEvent(
      new MessageEvent('message', { data: { id: 'y', origin: MESSAGE_ORIGIN_PAGE }, source: null })
    );

    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('opens no port while the page is prerendered and sends its requests once it is shown', async () => {
    prerendering = true;
    await loadContentScript();

    const first = fromPage('request-1');
    const second = fromPage('request-2', 'solana(accounts)');

    expect(mocks.connect).not.toHaveBeenCalled();

    prerendering = false;
    document.dispatchEvent(new Event('prerenderingchange'));

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(ports[0].postMessage.mock.calls).toEqual([[first], [second]]);

    const third = fromPage('request-3');

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(ports[0].postMessage).toHaveBeenLastCalledWith(third);
  });

  it('fails what a closed port still owes and opens a new port only for the next request', async () => {
    await loadContentScript();

    fromPage('pending');
    fromPage('subscription', 'pub(accounts.subscribe)');
    fromPage('answered');
    ports[0].onMessage.emit({ id: 'subscription', subscription: [] });
    ports[0].onMessage.emit({ id: 'answered', response: [] });
    toPage.mockClear();

    ports[0].onDisconnect.emit();

    expect(toPage.mock.calls).toEqual([
      [{ id: 'pending', error: PORT_LOST, origin: MESSAGE_ORIGIN_CONTENT }, '*'],
      [{ id: 'subscription', error: PORT_LOST, origin: MESSAGE_ORIGIN_CONTENT }, '*'],
    ]);
    expect(mocks.connect).toHaveBeenCalledOnce();

    ports[0].onMessage.emit({ id: 'pending', response: 'late' });
    ports[0].onDisconnect.emit();

    expect(toPage).toHaveBeenCalledTimes(2);

    const retry = fromPage('retry');

    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(ports[1].postMessage).toHaveBeenCalledExactlyOnceWith(retry);
  });

  it('keeps a subscription open after its answer and fails nothing when its port closes', async () => {
    await loadContentScript();

    fromPage('subscription', 'evm(events.subscribe)');
    ports[0].onMessage.emit({ id: 'subscription', response: true });
    ports[0].onMessage.emit({ id: 'subscription', subscription: { type: 'accountsChanged', payload: [] } });
    toPage.mockClear();

    ports[0].onDisconnect.emit();

    expect(toPage).not.toHaveBeenCalled();
  });

  it('drops the port after a back/forward cache restore and fails its open requests', async () => {
    await loadContentScript();

    fromPage('before');
    pageShow(false);

    expect(ports[0].disconnect).not.toHaveBeenCalled();
    expect(toPage).not.toHaveBeenCalled();

    pageShow(true);

    expect(ports[0].disconnect).toHaveBeenCalledOnce();
    expect(toPage).toHaveBeenCalledExactlyOnceWith(
      { id: 'before', error: PORT_LOST, origin: MESSAGE_ORIGIN_CONTENT },
      '*'
    );

    ports[0].onMessage.emit({ id: 'before', response: 'late' });
    expect(toPage).toHaveBeenCalledOnce();

    const after = fromPage('after');

    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(ports[1].postMessage).toHaveBeenCalledExactlyOnceWith(after);
  });

  it('answers a request it cannot send instead of leaving it open', async () => {
    await loadContentScript();
    mocks.connect.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });

    fromPage('request-1');

    expect(toPage).toHaveBeenCalledExactlyOnceWith(
      {
        id: 'request-1',
        error: 'Fearless Wallet could not be reached. Reload the page and try again.',
        origin: MESSAGE_ORIGIN_CONTENT,
      },
      '*'
    );

    const next = fromPage('request-2');

    expect(ports[0].postMessage).toHaveBeenCalledExactlyOnceWith(next);
  });
});

describe('content script port with the page providers', () => {
  beforeEach(() => setUp(false));
  afterEach(tearDown);

  const loadPage = async () => {
    await loadContentScript();

    const page = await import('@extension-base/page');
    const { createSubstrateProvider } = await import('@/extension/entry/substrateProvider');
    const { FearlessWalletEvmProvider } = await import('@extension-base/page/FearlessWalletEvmProvider');

    // As page.ts: answers from the content script settle the page's requests.
    window.addEventListener('message', ({ data, source }: MessageEvent) => {
      if (source === window && data.origin === MESSAGE_ORIGIN_CONTENT && data.id) page.handleResponse(data);
    });

    return {
      substrate: createSubstrateProvider({ version: 'test', enable: page.enable, checkIfPhishing: page.redirectIfPhishing }),
      evm: new FearlessWalletEvmProvider(),
    };
  };

  const posted = async (port: () => FakePort | undefined, message: string): Promise<Posted> => {
    let request: Posted | undefined;

    await vi.waitFor(() => {
      request = port()?.postMessage.mock.calls.map(([data]) => data as Posted).find((data) => data.message === message);
      expect(request).toBeDefined();
    });

    return request!;
  };

  it('lets a dApp connect again after the worker restarted under a pending enable()', async () => {
    const { substrate } = await loadPage();
    const first = substrate.enable('Example dApp');
    const phishing = await posted(() => ports[0], 'pub(phishing.redirectIfDenied)');

    ports[0].onMessage.emit({ id: phishing.id, response: false });
    await posted(() => ports[0], 'pub(authorize.tab)');
    ports[0].onDisconnect.emit();

    await expect(first).rejects.toThrow(PORT_LOST);

    const retry = substrate.enable('Example dApp');

    expect(retry).not.toBe(first);

    const authorize = await posted(() => ports[1], 'pub(authorize.tab)');

    ports[1].onMessage.emit({ id: authorize.id, response: true });

    await expect(retry).resolves.toMatchObject({ accounts: expect.anything(), signer: expect.anything() });
  });

  it('lets a dApp ask for EVM accounts again after a back/forward cache restore', async () => {
    const { evm } = await loadPage();
    const first = evm.request({ method: 'eth_requestAccounts' });

    await posted(() => ports[0], 'evm(authorizeUrl)');
    pageShow(true);

    await expect(first).rejects.toThrow(PORT_LOST);

    const retry = evm.request({ method: 'eth_requestAccounts' });
    const authorize = await posted(() => ports[1], 'evm(authorizeUrl)');

    ports[1].onMessage.emit({ id: authorize.id, response: true });

    const accounts = await posted(() => ports[1], 'evm(request)');

    ports[1].onMessage.emit({ id: accounts.id, response: ['0x1234'] });

    await expect(retry).resolves.toEqual(['0x1234']);
  });
});
