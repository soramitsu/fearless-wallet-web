import { keyring } from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import handlers from '@extension-base/background/handlers';
import State, { initState } from '@extension-base/background/handlers/State';
import Extension from '../background/extension-base/src/background/handlers/Extension';
import AccountsStore from '../background/extension-base/src/stores/Accounts';
import type { RequestSignatures, TransportRequestMessage } from '@extension-base/background/types';

chrome.runtime.onInstalled.addListener(async () => {
  await initState();

  Extension.initExtension();
});

chrome.runtime.onConnect.addListener((tab): void => {
  State.injectFromStorage();

  tab.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, tab));
  tab.onDisconnect.addListener(() => console.warn(`Disconnected from ${tab.name}`));
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
