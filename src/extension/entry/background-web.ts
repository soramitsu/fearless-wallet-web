import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { initStorage } from '@extension-base/stores/Storage';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
import { keyring } from '@subwallet/ui-keyring';
import { retryableInitialization } from '@/bootstrap/retryableInitialization';

axios.defaults.adapter = 'fetch';

// Hold incoming requests until the keyring has finished initializing.
const initialize = retryableInitialization(async () => {
  const ready = await cryptoWaitReady();
  if (!ready) throw new Error('Wallet crypto initialization failed');
  await initStorage();
  await KeyringStoreWeb.initialize();
  await state.keyringService.loadAll();
  state.eventService.emit('crypto.ready', true);
  await state.keyringService.currentAccountReady;
  await keyring.restoreKeyringPassword();
  await MigrationService.start();
});

addEventListener('message', (event) => {
  const request = event as MessageEvent & { waitUntil: (work: Promise<unknown>) => void };
  request.waitUntil(
    initialize()
      .then(async () => {
        await handlers(request.data);
      })
      .catch(() => {
        const channel = new BroadcastChannel('sw-messages');
        channel.postMessage({ id: request.data?.id, error: 'Wallet services could not start.' });
        channel.close();
      })
  );
});
