import { keyring } from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers, { state } from '@extension-base/background/handlers';
import { initState } from '@extension-base/background/handlers/State';
import '@polkadot/extension-inject/crossenv';
import AccountsStore from '../background/extension-base/src/stores/Accounts';
import { RequestSignatures } from '../background/extension-base/src/background/types/messages';
import type { Port, TransportRequestMessage } from '@/extension/background/extension-base/src/background/types/types';
interface ModifiedPort extends Port {
  timer?: NodeJS.Timeout;
}

async function getActiveTabs() {
  // quering the current active tab in the current window should only ever return 1 tab
  // although an array is specified here

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const request: TransportRequestMessage<'pri(activeTabsUrl.update)'> = {
      id: 'background',
      message: 'pri(activeTabsUrl.update)',
      origin: 'background',
      request: { tabs },
    };

    handlers(request);
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await initState();
  state.onInstall();

  getActiveTabs();
});

chrome.alarms.create({ periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
  console.info('wake up service worker');
});

function deleteTimer(port: ModifiedPort) {
  if (port.timer) {
    clearTimeout(port.timer);
    delete port.timer;
  }
}

function forceReconnect(port: Port) {
  deleteTimer(port);
  port.disconnect();
}

chrome.runtime.onConnect.addListener((port: ModifiedPort) => {
  port.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, port));
  port.onDisconnect.addListener(deleteTimer);
  port.timer = setTimeout(forceReconnect, 250e3, port);
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
    keyring.loadAll({
      store: new AccountsStore(),
      type: 'sr25519',
    });
  })
  .catch((error): void => {
    console.error('initialization failed', error);
  });
