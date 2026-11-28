import { handlers } from '@extension-base/background/handlers';
import { stripUrl } from '@extension-base/background/helpers';
import { PORT_CONTENT, PORT_EXTENSION } from '@extension-base/defaults';
import type { Port } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({ extensionHandle: vi.fn(), tabsHandle: vi.fn(), flush: vi.fn(), expire: vi.fn() }));

vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION: true,
}));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: { id: 'walletextensionid', getURL: (path: string) => `chrome-extension://walletextensionid/${path}` },
  },
}));
vi.mock('@extension-base/stores/BaseExtension', () => ({ default: { flush: mocks.flush } }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: { flush: vi.fn() } }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: { flush: vi.fn() } }));
vi.mock('@extension-base/background/handlers/Extension', () => ({
  default: class {
    handle = mocks.extensionHandle;
  },
}));
vi.mock('@extension-base/background/handlers/Tabs', () => ({
  default: class {
    handle = mocks.tabsHandle;
  },
}));
vi.mock('@extension-base/background/handlers/State', () => ({ default: class {
  keyringLockService = { lockIfExpired: mocks.expire };
} }));

const request = {
  id: 'request-1',
  message: 'pri(accounts.makeCrossChain)',
  request: {},
} as unknown as Parameters<typeof handlers>[0];

const port = (name: string, sender: chrome.runtime.MessageSender) => {
  const postMessage = vi.fn();

  return { port: { name, sender, postMessage } as unknown as Port, postMessage };
};

describe('background port sender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extensionHandle.mockResolvedValue('extension');
    mocks.tabsHandle.mockResolvedValue('tab');
    mocks.flush.mockResolvedValue(undefined);
  });

  it.each(['popup.html', 'index.html#/wallet', 'notification.html'])(
    'gives the wallet page %s the privileged handlers',
    async (page) => {
      const { port: walletPort, postMessage } = port(PORT_EXTENSION, {
        id: 'walletextensionid',
        url: `chrome-extension://walletextensionid/${page}`,
      });

      await handlers(request, walletPort);

      expect(mocks.extensionHandle).toHaveBeenCalledOnce();
      expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(mocks.extensionHandle.mock.invocationCallOrder[0]);
      expect(postMessage).toHaveBeenCalledWith({ id: 'request-1', response: 'extension' });
    }
  );

  it.each([
    ['a content script naming the privileged port', { id: 'walletextensionid', url: 'https://example.com/', tab: { url: 'https://example.com/' } }],
    ['another extension', { id: 'otherextensionid', url: 'chrome-extension://otherextensionid/popup.html' }],
    ['a look-alike origin', { id: 'walletextensionid', url: 'chrome-extension://walletextensionid.example/popup.html' }],
    ['a sender without a URL', { id: 'walletextensionid' }],
  ])('refuses %s', async (_label, sender) => {
    const { port: foreignPort, postMessage } = port(PORT_EXTENSION, sender as chrome.runtime.MessageSender);

    await handlers(request, foreignPort);

    expect(mocks.extensionHandle).not.toHaveBeenCalled();
    expect(mocks.tabsHandle).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ id: 'request-1', error: 'Unauthorized sender' });
  });

  it('keeps sending content-script traffic to the page handlers with the page origin', async () => {
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      frameId: 0,
      origin: 'https://example.com',
      url: 'https://example.com/page?x=1',
      tab: { url: 'https://example.com/page?x=1' } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    expect(mocks.tabsHandle).toHaveBeenCalledWith('request-1', request.message, request.request, 'https://example.com', contentPort);
    expect(mocks.extensionHandle).not.toHaveBeenCalled();
  });

  it('keeps a saved grant: a top-frame page maps to the key its tab URL gave before', async () => {
    const page = 'http://127.0.0.1:18711/a.html?x=1#y';
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      frameId: 0,
      origin: 'http://127.0.0.1:18711',
      url: page,
      tab: { url: page } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    const from = mocks.tabsHandle.mock.calls[0][3] as string;
    expect(stripUrl(from)).toBe(stripUrl(page));
  });

  it('names the site by the port document, not by the page the tab shows', async () => {
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      frameId: 0,
      origin: 'https://site-b.example',
      url: 'https://site-b.example/b.html',
      tab: { url: 'https://site-a.example/a.html' } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    expect(mocks.tabsHandle).toHaveBeenCalledWith('request-1', request.message, request.request, 'https://site-b.example', contentPort);
  });

  it('falls back to the port document URL where the browser gives no origin', async () => {
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      frameId: 0,
      url: 'https://site-b.example/b.html',
      tab: { url: 'https://site-a.example/a.html' } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    expect(mocks.tabsHandle).toHaveBeenCalledWith('request-1', request.message, request.request, 'https://site-b.example/b.html', contentPort);
  });

  it('gives a sandboxed page with an opaque origin no grant of its host', async () => {
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      frameId: 0,
      origin: 'null',
      url: 'https://site-a.example/uploads/page.html',
      tab: { url: 'https://site-a.example/uploads/page.html' } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    const from = mocks.tabsHandle.mock.calls[0][3] as string;
    expect(() => stripUrl(from)).toThrow('Invalid dApp URL');
  });

  it.each([
    [
      'a page Chrome is prerendering in the tab of an authorized site',
      {
        frameId: 5,
        documentLifecycle: 'prerender',
        origin: 'http://127.0.0.1:18712',
        url: 'http://127.0.0.1:18712/b.html',
        tab: { url: 'http://127.0.0.1:18711/a4.html' },
      },
    ],
    ['a subframe', { frameId: 3, origin: 'https://ads.example', url: 'https://ads.example/frame', tab: { url: 'https://site-a.example/' } }],
    ['a sender without a frame', { origin: 'https://site-a.example', url: 'https://site-a.example/' }],
  ])('refuses page requests from %s', async (_label, sender) => {
    const { port: contentPort, postMessage } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      ...sender,
    } as chrome.runtime.MessageSender);

    await handlers(request, contentPort);

    expect(mocks.tabsHandle).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ id: 'request-1', error: 'Unauthorized sender' });
  });
});
