import { chrome } from '@extension-base/utils/crossenv';
import type State from '../../../background/handlers/State';
import { withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import { IS_EXTENSION, IS_EXTENSION_SMOKE } from '@/consts/global';

const popupUrl = (path?: string): string => {
  if (!IS_EXTENSION) return '';

  return chrome.runtime.getURL(path ? `popup.html#${path.startsWith('/') ? path : `/${path}`}` : 'popup.html');
};

const NOTIFICATION_URL = popupUrl();
export const IROHA_CONNECT_POPUP_PATH = '/fearless/settings/iroha-connect';

export const POPUP_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  height: 640,
  width: 577,
  type: 'popup',
  url: NOTIFICATION_URL,
};

export class PopupHandler {
  private windows: number[] = [];

  constructor(private state: State) {
    if (IS_EXTENSION) chrome.windows.onRemoved.addListener((windowId) => this.forgetPopup(windowId));
  }

  public get popup() {
    return this.windows;
  }

  public updateIcon(shouldClose?: boolean): void {
    const numRequests = this.state.requestService.numRequests;
    const text = numRequests > 0 ? numRequests.toString() : '';

    withErrorLog(() => chrome.action.setBadgeText({ text }));

    if (!shouldClose) return;
    if (text === '') {
      this.popupClose();
      return;
    }

    if (this.windows.length > 0) {
      const path = this.state.requestService.numStandardRequests > 0 ? undefined : IROHA_CONNECT_POPUP_PATH;

      this.state.requestService.popupOpen(path);
    }
  }

  public popupClose(): void {
    this.windows.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));
    this.windows = [];
  }

  public forgetPopup(windowId: number): void {
    this.windows = this.windows.filter((id) => id !== windowId);
  }

  public async popupNavigate(windowId: number, path?: string): Promise<void> {
    if (!IS_EXTENSION) return;

    const popup = await chrome.windows.get(windowId, { populate: true });
    const tab = popup.tabs?.[0];
    if (tab?.id === undefined) throw new Error('The request popup has no navigable tab.');

    const url = popupUrl(path);
    if (tab.url !== url) await chrome.tabs.update(tab.id, { url });
  }

  public popupOpen(path?: string): void {
    if (!IS_EXTENSION || IS_EXTENSION_SMOKE) return;

    chrome.windows.getCurrent((win) => {
      const popupOptions = { ...POPUP_WINDOW_OPTS, url: popupUrl(path) };

      if (win) {
        popupOptions.left = (win.left || 0) + (win.width || 0) - (POPUP_WINDOW_OPTS.width || 0) - 20;
        popupOptions.top = (win.top || 0) + 75;
      }

      chrome.windows.create(popupOptions, (window): void => {
        if (window?.id !== undefined) this.windows.push(window.id);
      });
    });
  }
}
