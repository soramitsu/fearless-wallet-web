import { chrome } from '@extension-base/utils/crossenv';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import AccountsStore from '@extension-base/stores/Accounts';
// import { initStorage } from '@extension-base/stores/Storage';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
// import type { TransportRequestMessage, Port, MessageTypes } from '@extension-base/background/types/types';
// import { APP_VERSION } from '@/consts/global';

console.info('background initialization', chrome);

axios.defaults.adapter = fetchAdapter;

addEventListener('message', (event) => {
  // event is an ExtendableMessageEvent object
  console.info(`The client sent me a message`, event);
  handlers(event?.data, undefined);
});

cryptoWaitReady()
  .then(() => {
    state.keyringService.loadAll(new AccountsStore());
    state.eventService.emit('crypto.ready', true);

    const migrationService = new MigrationService();

    migrationService.start();
  })
  .catch((error) => console.error('initialization failed', error));
