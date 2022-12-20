import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers from '@extension-base/background/handlers';
import State, { initState } from '@extension-base/background/handlers/State';
import type { RequestSignatures, TransportRequestMessage } from '@extension-base/background/types';
import { keyring } from '@/controllers/keyringChrome';

chrome.runtime.onInstalled.addListener(async () => {
  await initState();
});

chrome.runtime.onConnect.addListener((tab): void => {
  console.info('onConnect fired');
  State.injectFromStorage();
  console.info(tab, 'tab');
  tab.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, tab));
  tab.onDisconnect.addListener(() => console.warn(`Disconnected from ${tab.name}`));
});

chrome.runtime.onSuspend.addListener(() => {
  console.info('suspend');
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
