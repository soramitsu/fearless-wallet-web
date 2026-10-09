const chromeMocks = vi.hoisted(() => ({
  addWindowRemovedListener: vi.fn(),
  createWindow: vi.fn(),
  getCurrentWindow: vi.fn(),
  getPopupWindow: vi.fn(),
  getUrl: vi.fn((path: string) => `chrome-extension://fearless/${path}`),
  removeWindow: vi.fn(),
  setBadgeText: vi.fn(),
  updateTab: vi.fn(),
  updateWindow: vi.fn(),
}));

vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    action: { setBadgeText: chromeMocks.setBadgeText },
    runtime: { getURL: chromeMocks.getUrl },
    tabs: { update: chromeMocks.updateTab },
    windows: {
      create: chromeMocks.createWindow,
      get: chromeMocks.getPopupWindow,
      getCurrent: chromeMocks.getCurrentWindow,
      onRemoved: { addListener: chromeMocks.addWindowRemovedListener },
      remove: chromeMocks.removeWindow,
      update: chromeMocks.updateWindow,
    },
  },
}));

vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION: true,
  IS_EXTENSION_SMOKE: false,
}));

import { PopupHandler } from '@extension-base/services/request-service/handlers/PopupHandler';
import { RequestService } from '@extension-base/services/request-service';

const REVIEW_PATH = '/fearless/settings/iroha-connect';
const REVIEW_URL = `chrome-extension://fearless/popup.html#${REVIEW_PATH}`;
const DEFAULT_URL = 'chrome-extension://fearless/popup.html';

const requestCount = (phase: string): number => {
  const context = {
    state: { irohaConnectService: { snapshot: { phase } } },
    numMetaRequests: 0,
    numAuthRequests: 0,
    numSubstrateRequests: 0,
    numConnectWCRequests: 0,
    numNotSupportWCRequests: 0,
    numSignWCRequests: 0,
    numSolanaSignRequests: 0,
  };
  const numStandardRequests = Object.getOwnPropertyDescriptor(
    RequestService.prototype,
    'numStandardRequests'
  )!.get!.call(context) as number;
  const numIrohaConnectRequests = Object.getOwnPropertyDescriptor(
    RequestService.prototype,
    'numIrohaConnectRequests'
  )!.get!.call(context) as number;

  return Object.getOwnPropertyDescriptor(RequestService.prototype, 'numRequests')!.get!.call({
    numStandardRequests,
    numIrohaConnectRequests,
  }) as number;
};

describe('request popup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeMocks.getCurrentWindow.mockImplementation((callback: (window: object) => void) =>
      callback({ left: 20, top: 10, width: 1_200 })
    );
    chromeMocks.createWindow.mockImplementation((_options: object, callback: (window: object) => void) =>
      callback({ id: 17 })
    );
    chromeMocks.getPopupWindow.mockResolvedValue({ tabs: [{ id: 23 }] });
    chromeMocks.updateTab.mockResolvedValue({});
    chromeMocks.updateWindow.mockResolvedValue({ id: 17 });
  });

  it('opens a new review popup at the requested internal route', () => {
    const handler = new PopupHandler({ requestService: { numRequests: 0 } } as never);

    handler.popupOpen(REVIEW_PATH);

    expect(chromeMocks.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ focused: true, type: 'popup', url: REVIEW_URL }),
      expect.any(Function)
    );
    expect(handler.popup).toEqual([17]);
  });

  it('focuses an existing request popup and navigates its tab to the review route', async () => {
    const popupNavigate = vi.fn().mockResolvedValue(undefined);
    const popupOpen = vi.fn();

    RequestService.prototype.popupOpen.call(
      { popupHandler: { popup: [17], popupNavigate, popupOpen } } as never,
      REVIEW_PATH
    );

    await vi.waitFor(() => expect(popupNavigate).toHaveBeenCalledWith(17, REVIEW_PATH));
    expect(chromeMocks.updateWindow).toHaveBeenCalledWith(17, { focused: true });
    expect(popupOpen).not.toHaveBeenCalled();
  });

  it('routes an existing popup through its populated tab', async () => {
    const handler = new PopupHandler({ requestService: { numRequests: 0 } } as never);

    handler.popupNavigate(17, REVIEW_PATH);

    await vi.waitFor(() => expect(chromeMocks.updateTab).toHaveBeenCalledWith(23, { url: REVIEW_URL }));
    expect(chromeMocks.getPopupWindow).toHaveBeenCalledWith(17, { populate: true });
  });

  it('returns an Iroha review popup to the default route when an ordinary request arrives', async () => {
    chromeMocks.getPopupWindow.mockResolvedValue({ tabs: [{ id: 23, url: REVIEW_URL }] });
    const handler = new PopupHandler({ requestService: { numRequests: 0 } } as never);

    await handler.popupNavigate(17);

    expect(chromeMocks.updateTab).toHaveBeenCalledWith(23, { url: DEFAULT_URL });
  });

  it('falls back to a new direct-route popup after pruning a stale window', async () => {
    const popup = [17];
    const popupOpen = vi.fn();
    const popupHandler = {
      popup,
      popupNavigate: vi.fn().mockRejectedValue(new Error('No window')),
      forgetPopup: vi.fn((windowId: number) => popup.splice(popup.indexOf(windowId), 1)),
      popupOpen,
    };
    const context = {
      popupHandler,
      popupOpen(path?: string) {
        RequestService.prototype.popupOpen.call(context as never, path);
      },
    };

    context.popupOpen(REVIEW_PATH);

    await vi.waitFor(() => expect(popupOpen).toHaveBeenCalledWith(REVIEW_PATH));
    expect(popupHandler.forgetPopup).toHaveBeenCalledWith(17);
  });

  it('does not reload a popup that is already on the requested route', async () => {
    chromeMocks.getPopupWindow.mockResolvedValue({ tabs: [{ id: 23, url: REVIEW_URL }] });
    const handler = new PopupHandler({ requestService: { numRequests: 0 } } as never);

    await handler.popupNavigate(17, REVIEW_PATH);

    expect(chromeMocks.updateTab).not.toHaveBeenCalled();
  });

  it('counts Iroha approvals so shared cleanup cannot close their review popup', () => {
    expect(requestCount('session-approval')).toBe(1);
    expect(requestCount('request-approval')).toBe(1);
    expect(requestCount('connected')).toBe(0);

    const requestService = {
      numIrohaConnectRequests: 1,
      numRequests: 1,
      numStandardRequests: 0,
      popupOpen: vi.fn(),
    };
    const handler = new PopupHandler({ requestService } as never);
    handler.popupOpen(REVIEW_PATH);

    handler.updateIcon(true);
    expect(chromeMocks.setBadgeText).toHaveBeenLastCalledWith({ text: '1' });
    expect(chromeMocks.removeWindow).not.toHaveBeenCalled();
    expect(requestService.popupOpen).toHaveBeenCalledWith(REVIEW_PATH);

    requestService.numRequests = 0;
    requestService.numIrohaConnectRequests = 0;
    handler.updateIcon(true);
    expect(chromeMocks.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    expect(chromeMocks.removeWindow).toHaveBeenCalledWith(17);
  });

  it('restores the route for whichever approval queue remains', () => {
    const requestService = {
      numIrohaConnectRequests: 0,
      numRequests: 1,
      numStandardRequests: 1,
      popupOpen: vi.fn(),
    };
    const handler = new PopupHandler({ requestService } as never);
    handler.popupOpen(REVIEW_PATH);

    handler.updateIcon(true);
    expect(requestService.popupOpen).toHaveBeenLastCalledWith(undefined);

    requestService.numIrohaConnectRequests = 1;
    requestService.numStandardRequests = 0;
    handler.updateIcon(true);
    expect(requestService.popupOpen).toHaveBeenLastCalledWith(REVIEW_PATH);
  });
});
