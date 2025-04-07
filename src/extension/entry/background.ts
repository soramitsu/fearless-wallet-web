import { chrome } from '@extension-base/utils/crossenv';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import { initStorage } from '@extension-base/stores/Storage';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
import { keyring } from '@subwallet/ui-keyring';
import type { TransportRequestMessage, Port, MessageTypes } from '@extension-base/background/types/types';

console.info('background initialization');

axios.defaults.adapter = fetchAdapter;

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
  if (details.reason === 'update') await state.onboardingService.updateStorage('regular', true);

  state.onboardingService.init();

  initStorage().then(() => state.onInstall());

  getActiveTabs();
});

chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload());

chrome.runtime.onConnect.addListener((port: Port) =>
  port.onMessage.addListener((data: TransportRequestMessage<MessageTypes>) => handlers(data, port))
);

// listen to tab updates this is fired on url change
chrome.tabs.onUpdated.addListener((_, changeInfo) => {
  // we are only interested in url change
  if (!changeInfo.url) return;

  getActiveTabs();
});

// the list of active tab changes when switching window
// in a mutli window setup
chrome.windows.onFocusChanged.addListener(() => getActiveTabs());

// when clicking on an existing tab or opening a new tab this will be fired
// before the url is entered by users
chrome.tabs.onActivated.addListener(() => getActiveTabs());

// when deleting a tab this will be fired
chrome.tabs.onRemoved.addListener(() => getActiveTabs());

cryptoWaitReady()
  .then(() => {
    state.keyringService.loadAll();
    state.eventService.emit('crypto.ready', true);

    keyring.restoreKeyringPassword();

    MigrationService.start();
  })
  .catch((error) => console.error('initialization failed', error));
