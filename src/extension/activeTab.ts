import { chrome } from '@extension-base/utils/crossenv';

/**
 * Calls onChange when another tab becomes active, the active tab moves to another address, or another window takes
 * focus. The side panel stays open while the person browses, so what it says about the current site must follow.
 */
export function followActiveTab(onChange: () => void, api: typeof chrome = chrome): () => void {
  const onActivated = () => onChange();
  const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.url !== undefined && tab.active) onChange();
  };
  const onFocusChanged = (windowId: number) => {
    if (windowId !== api.windows.WINDOW_ID_NONE) onChange();
  };

  api.tabs.onActivated.addListener(onActivated);
  api.tabs.onUpdated.addListener(onUpdated);
  api.windows.onFocusChanged.addListener(onFocusChanged);

  return () => {
    api.tabs.onActivated.removeListener(onActivated);
    api.tabs.onUpdated.removeListener(onUpdated);
    api.windows.onFocusChanged.removeListener(onFocusChanged);
  };
}
