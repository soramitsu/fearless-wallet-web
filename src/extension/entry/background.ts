import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers, { state } from '@extension-base/background/handlers';
import '@polkadot/extension-inject/crossenv';
import AccountsStore from '@extension-base/stores/Accounts';
import { initStorage } from '@extension-base/stores/Storage';
import { RequestSignatures } from '@extension-base/background/types/messages';
import { TransportRequestMessage, Port } from '@extension-base/background/types/types';
import { keyringService } from '@extension-base/services';

async function getActiveTabs() {
  // quering the current active tab in the current window should only ever return 1 tab
  // although an array is specified here

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const request: TransportRequestMessage<'pri(tabs.update.activeTabsUrl)'> = {
      id: 'background',
      message: 'pri(tabs.update.activeTabsUrl)',
      origin: 'background',
      request: { tabs },
    };

    handlers(request);
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update' && state.onboardingService.user === 'new') {
    state.onboardingService.changeUserType('regular');
    state.onboardingService.seen = false;
  }

  await initStorage();

  state.onInstall();

  getActiveTabs();
});

chrome.runtime.onUpdateAvailable.addListener(() => {
  //for FIREFOX
  if (chrome.extension.getViews !== undefined) {
    const windows = chrome.extension.getViews({});
    // one window = background page => means we can update our extension
    if (windows.length === 1) chrome.runtime.reload();
  }

  //TODO we need to move on from "@types/chrome" to "chrome-types" lib do something with beacon-sdk
  //chrome after v116
  (chrome.runtime as any).getContexts({}, (vals: Record<string, string>[]) => {
    if (vals.length === 1) chrome.runtime.reload();
  });
});

chrome.runtime.onConnect.addListener((port: Port) => {
  port.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, port));
});

// listen to tab updates this is fired on url change
chrome.tabs.onUpdated.addListener((_, changeInfo) => {
  // we are only interested in url change
  if (!changeInfo.url) {
    return;
  }

  getActiveTabs();
});

// the list of active tab changes when switching window
// in a mutli window setup
chrome.windows.onFocusChanged.addListener(() => getActiveTabs());

// when clicking on an existing tab or opening a new tab this will be fired
// before the url is entered by users
chrome.tabs.onActivated.addListener(() => {
  getActiveTabs();
});

// when deleting a tab this will be fired
chrome.tabs.onRemoved.addListener(() => {
  getActiveTabs();
});

cryptoWaitReady()
  .then((): void => {
    keyringService.loadAll(new AccountsStore());
    state.eventService.emit('crypto.ready', true);
  })
  .catch((error): void => {
    console.error('initialization failed', error);
  });
