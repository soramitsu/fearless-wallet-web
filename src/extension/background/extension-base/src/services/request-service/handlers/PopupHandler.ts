import { chrome } from '@extension-base/utils/crossenv';
import type State from '../../../background/handlers/State';
import { withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import { IS_EXTENSION } from '@/consts/global';

const NOTIFICATION_URL = IS_EXTENSION ? chrome.runtime.getURL('popup.html') : '';

export const POPUP_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  height: 640,
  width: 577,
  type: 'popup',
  url: NOTIFICATION_URL,
};

export class PopupHandler {
  private windows: number[] = [];

  constructor(private state: State) {}

  public get popup() {
    return this.windows;
  }

  public updateIcon(shouldClose?: boolean): void {
    const numRequests = this.state.requestService.numRequests;
    const text = numRequests > 0 ? numRequests.toString() : '';

    withErrorLog(() => chrome.action.setBadgeText({ text }));

    if (shouldClose && text === '') this.popupClose();
  }

  public popupClose(): void {
    this.windows.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));
    this.windows = [];
  }

  public popupOpen(): void {
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
