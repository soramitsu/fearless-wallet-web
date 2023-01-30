import { keyring } from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers from '@extension-base/background/handlers';
import State, { initState } from '@extension-base/background/handlers/State';
import AccountsStore from '../background/extension-base/src/stores/Accounts';
import type { RequestSignatures, TransportRequestMessage } from '@extension-base/background/types';

chrome.runtime.onInstalled.addListener(async () => {
  await initState();
});

chrome.runtime.onConnect.addListener((port): void => {
  State.injectFromStorage();

  port.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, port));
  port.onDisconnect.addListener(() => console.warn(`Disconnected from ${port.name}`));
});

function getActiveTabs() {
  // queriing the current active tab in the current window should only ever return 1 tab
  // although an array is specified here
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // get the urls of the active tabs. In the case of new tab the url may be empty or undefined
    // we filter these out
    const urls: string[] = tabs.map(({ url }) => url).filter((url) => !!url) as string[];

    const request: TransportRequestMessage<'pri(activeTabsUrl.update)'> = {
      id: 'background',
      message: 'pri(activeTabsUrl.update)',
      origin: 'background',
      request: { urls },
    };

    handlers(request);
  });
}

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
    keyring.loadAll({
      store: new AccountsStore(),
      type: 'sr25519',
    });
  })
  .catch((error): void => {
    console.error('initialization failed', error);
  });
