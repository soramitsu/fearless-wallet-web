import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
import { keyring } from '@subwallet/ui-keyring';

axios.defaults.adapter = 'fetch';

addEventListener('message', (event) => {
  // event is an ExtendableMessageEvent object
  console.info('[test] The client sent me a message', event);

  handlers(event?.data);
});

cryptoWaitReady()
  .then(() => {
    state.keyringService.loadAll();
    state.eventService.emit('crypto.ready', true);

    keyring.restoreKeyringPassword();

    MigrationService.start();
  })
  .catch((error) => console.error('initialization failed', error));
