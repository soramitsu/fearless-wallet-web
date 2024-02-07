import { type BrowserConfirmationType } from './types';

const NOTIFICATION_URL = chrome.runtime.getURL('popup.html');

export const DEFAULT_NOTIFICATION_TYPE: BrowserConfirmationType = 'popup';

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
