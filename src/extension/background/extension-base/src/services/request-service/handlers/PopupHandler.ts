import { RequestService } from '..';
import { withErrorLog } from '../../../background/handlers/helpers';
import { DEFAULT_NOTIFICATION_TYPE } from '../consts';
import { BrowserConfirmationType } from '../types';

const NOTIFICATION_URL = chrome.runtime.getURL('popup.html');

export const POPUP_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  height: 640,
  width: 577,
  type: 'popup',
  url: NOTIFICATION_URL,
};

export const NORMAL_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  type: 'normal',
  url: NOTIFICATION_URL,
};

export default class PopupHandler {
  readonly requestService: RequestService;
  notification: BrowserConfirmationType = DEFAULT_NOTIFICATION_TYPE;
  windows: number[] = [];

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  public updateIcon(shouldClose?: boolean): void {
    const numRequests = this.requestService.numRequests;
    const text = numRequests > 0 ? numRequests.toString() : '';

    withErrorLog(() => chrome.browserAction?.setBadgeText({ text }));

    if (shouldClose && text === '') {
      this.popupClose();
    }
  }

  public get popup() {
    return this.windows;
  }

  public popupClose(): void {
    this.windows.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));
    this.windows = [];
  }

  public popupOpen(): void {
    if (this.notification && this.notification !== 'extension')
      chrome.windows.getCurrent((win) => {
        const popupOptions = { ...POPUP_WINDOW_OPTS };

        if (win) {
          popupOptions.left = (win.left || 0) + (win.width || 0) - (POPUP_WINDOW_OPTS.width || 0) - 20;
          popupOptions.top = (win.top || 0) + 75;
        }

        chrome.windows.create(popupOptions, (window): void => {
          if (window) this.windows.push(window.id || 0);
        });
      });
  }
}
