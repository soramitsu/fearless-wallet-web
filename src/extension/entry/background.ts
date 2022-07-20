import '@polkadot/extension-inject/crossenv';

import type { RequestSignatures, TransportRequestMessage } from '@polkadot/extension-base/background/types';

import handlers from '@polkadot/extension-base/background/handlers';
import { PORT_CONTENT, PORT_EXTENSION } from '@polkadot/extension-base/defaults';
import keyring from '@polkadot/ui-keyring';
import { assert } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';
// import AccountsStore from './storeChrome/Accounts';
chrome.runtime.onConnect.addListener((port): void => {
  assert([PORT_CONTENT, PORT_EXTENSION].includes(port.name), `Unknown connection from ${port.name}`);

  port.onMessage.addListener((data: TransportRequestMessage<keyof RequestSignatures>) => handlers(data, port));
  port.onDisconnect.addListener(() => console.warn(`Disconnected from ${port.name}`));
});

cryptoWaitReady()
  .then((): void => {
    // load all the keyring data
    keyring.loadAll({
      // store: new AccountsStore(),
      type: 'sr25519',
    });
  })
  .catch((error): void => {
    console.error('initialization failed', error);
  });
