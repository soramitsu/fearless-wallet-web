import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers from '@extension-base/background/handlers';
import State, { initState } from '@extension-base/background/handlers/State';
import type { RequestSignatures, TransportRequestMessage } from '@extension-base/background/types';
import { keyring } from '@/controllers/keyringChrome';

chrome.runtime.onInstalled.addListener(async () => {
  await initState();

  chrome.storage.local.get(null).then((store) => {
    console.info(store, 'chrome store on install');
  });
});

chrome.runtime.onConnect.addListener((tab): void => {
  State.injectFromStorage();

  tab.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, tab));
  tab.onDisconnect.addListener(() => console.warn(`Disconnected from ${tab.name}`));
});

cryptoWaitReady()
  .then((): void => {
    keyring.loadAll({
      type: 'sr25519',
    });
  })
  .catch((error): void => {
    console.error('initialization failed', error);
  });
