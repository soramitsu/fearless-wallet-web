import { handlers } from '@extension-base/background/handlers';
import { PORT_CONTENT, PORT_EXTENSION } from '@extension-base/defaults';
import type { Port } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({ extensionHandle: vi.fn(), tabsHandle: vi.fn(), flush: vi.fn(), expire: vi.fn() }));

vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
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

  it('keeps sending content-script traffic to the page handlers with the page URL', async () => {
    const { port: contentPort } = port(PORT_CONTENT, {
      id: 'walletextensionid',
      url: 'https://example.com/frame',
      tab: { url: 'https://example.com/' } as chrome.tabs.Tab,
    });

    await handlers(request, contentPort);

    expect(mocks.tabsHandle).toHaveBeenCalledWith('request-1', request.message, request.request, 'https://example.com/', contentPort);
    expect(mocks.extensionHandle).not.toHaveBeenCalled();
  });
});
