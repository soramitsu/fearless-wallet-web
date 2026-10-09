import { chrome } from '@extension-base/utils/crossenv';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import { initStorage } from '@extension-base/stores/Storage';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
import { keyring } from '@subwallet/ui-keyring';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';

console.info('background initialization');

const ASSET_DISCOVERY_ALARM = 'fearless-asset-discovery-sweep';

axios.defaults.adapter = 'fetch';

function getActiveTabs() {
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

async function onInstalled(details: chrome.runtime.InstalledDetails) {
  if (details.reason === 'update') {
    await state.onboardingService.updateStorage('regular', true);

    if (details.previousVersion !== APP_VERSION) chrome.runtime.reload();
  }

  state.onboardingService.init();

  initStorage().then(() => state.onInstall());

  getActiveTabs();
}

export const backgroundRuntime = {
  handleMessage: handlers,
  onInstalled,
  getActiveTabs,
  onAlarm(alarm: chrome.alarms.Alarm) {
    if (alarm.name === ASSET_DISCOVERY_ALARM && state.isReady()) {
      void state.assetDiscoverySweepService.runIfDue();
    }
  },
};

export const backgroundReady = cryptoWaitReady()
  .then(async () => {
    await state.keyringService.loadAll();
    state.eventService.emit('crypto.ready', true);
    await state.keyringService.currentAccountReady;

    keyring.restoreKeyringPassword();

    MigrationService.start();
    return backgroundRuntime;
  });
