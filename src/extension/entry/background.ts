import { keyring } from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers from '../background/extension-base/src/background/handlers';
import { initState } from '../background/extension-base/src/background/handlers/State';
import type { RequestSignatures, TransportRequestMessage } from '@polkadot/extension-base/background/types';

chrome.runtime.onInstalled.addListener(() => {
  initState();
  chrome.contextMenus.create({
    id: 'sampleContextMenu',
    title: 'Sample Context Menu',
    contexts: ['selection'],
  });
});
chrome.runtime.onConnect.addListener((tab): void => {
  console.info(tab);
  initState();

  tab.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, tab));
  tab.onDisconnect.addListener(() => console.warn(`Disconnected from ${tab.name}`));
});

chrome.runtime.onMessage.addListener((request, sender) => {
  console.info('Message received!');
  console.info('request: ', request);
  console.info('sender: ', sender);
  console.info('tab id:', sender.tab?.id);
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
