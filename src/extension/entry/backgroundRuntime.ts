import { chrome } from '@extension-base/utils/crossenv';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { handlers, state } from '@extension-base/background/handlers';
import { initStorage } from '@extension-base/stores/Storage';
import KeyringStore from '@extension-base/stores/KeyringStore';
import { tonStore } from '@extension-base/stores/TonStore';
import MigrationService from '@extension-base/services/migration-service';
import axios from 'axios';
import { keyring } from '@subwallet/ui-keyring';
import { WALLET_STORAGE_UNAVAILABLE } from './backgroundBootstrap';
import type { MessageTypes, Port, TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';
import { boundedAttempts, withDeadline } from '@/bootstrap/boundedAttempts';
import { retryableInitialization } from '@/bootstrap/retryableInitialization';

console.info('background initialization');

const ASSET_DISCOVERY_ALARM = 'fearless-asset-discovery-sweep';
const STORAGE_READ = { attempts: 3, retryDelaysMs: [250, 1000] };
// A request is answered within this time even when a read never answers. It is shorter
// than the popup's own 20 s start-up limit, so the popup can show the storage message.
const STORAGE_WAIT_MS = 15000;

axios.defaults.adapter = 'fetch';

let initialRead = true;
let accountsLoaded = false;
let passwordRestored = false;
let tonAccountsLoaded = false;
let walletRecordsLoaded = false;
let currentAccountLoaded = false;

// ui-keyring's restoreKeyringPassword() cannot report a failed read, and treating one as "no
// master password" would offer to set a new password. Read the record strictly and apply it
// as restoreKeyringPassword() does (Base.js in @subwallet/ui-keyring 0.1.14).
async function restoreKeyringPassword(): Promise<void> {
  const record = await new KeyringStore().getAndWait();

  if (record) keyring.keyring.setupMasterPassword(record.passwordHash);
}

// The first try waits for the reads the keyring services started when they were created;
// a later try reads storage again. Finished steps are not repeated, so a failed password or
// TON read does not read the accounts again.
async function readWalletStorage(): Promise<void> {
  const initial = initialRead;
  const { keyringService } = state;

  initialRead = false;

  if (!accountsLoaded) {
    await keyringService.loadAll();
    accountsLoaded = true;
  }

  if (!passwordRestored) {
    await restoreKeyringPassword();
    passwordRestored = true;
  }

  if (!tonAccountsLoaded) {
    await (initial ? tonStore.loaded : keyringService.tonKeyring.loadAll());
    tonAccountsLoaded = true;
  }

  if (!walletRecordsLoaded) {
    walletRecordsLoaded = true;
    state.eventService.emit('crypto.ready', true);
  }

  if (!currentAccountLoaded) {
    await (initial ? keyringService.currentAccountReady : keyringService.restoreCurrentAccount());

    currentAccountLoaded = true;
  }
}

// Settles the first time the wallet storage has been read, however many tries that took.
let markWalletStorageRead: () => void = () => {};
const walletStorageRead = new Promise<void>((resolve) => {
  markWalletStorageRead = resolve;
});

// Every request waits until the accounts, the master-password record, the TON accounts and
// the selected account are in memory; before that the wallet would look unlocked and empty.
// A failed read is tried a few times. After that, requests fail with WALLET_STORAGE_UNAVAILABLE
// instead of waiting, nothing is written, and the next request reads again.
const loadWalletStorage = retryableInitialization(async () => {
  try {
    await boundedAttempts(readWalletStorage, STORAGE_READ);
  } catch (error) {
    console.error('Wallet storage could not be read', error);

    throw new Error(WALLET_STORAGE_UNAVAILABLE, { cause: error });
  }

  try {
    MigrationService.start();
  } catch (error) {
    console.error('Wallet migration failed', error);
  }

  try {
    state.ensureCurrentAccount();
  } catch (error) {
    console.error('Default account could not be selected', error);
  }

  markWalletStorageRead();
});

const walletStorageReady = () => withDeadline(loadWalletStorage(), STORAGE_WAIT_MS, WALLET_STORAGE_UNAVAILABLE);

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
  // onInstall chooses a default account only when none is stored, so it must see the stored
  // one. Nobody waits on this event, so it waits for the read itself rather than a deadline.
  // Chrome sends this event once, so when storage cannot be read now the install work is not
  // dropped: it runs after the read a later request retries.
  const readOnRetry = await loadWalletStorage().then(
    () => false,
    () => walletStorageRead.then(() => true)
  );

  if (details.reason === 'update') {
    await state.onboardingService.updateStorage('regular', true);

    // This build is already running; reloading now would close the wallet window whose
    // retry has just read storage.
    if (!readOnRetry && details.previousVersion !== APP_VERSION) chrome.runtime.reload();
  }

  state.onboardingService.init();

  initStorage().then(() => state.onInstall());

  getActiveTabs();
}

async function handleMessage(data: TransportRequestMessage<MessageTypes>, port: Port): Promise<void> {
  await walletStorageReady();

  return handlers(data, port);
}

export const backgroundRuntime = {
  handleMessage,
  onInstalled,
  getActiveTabs,
  onAlarm(alarm: chrome.alarms.Alarm) {
    if (alarm.name === ASSET_DISCOVERY_ALARM && state.isReady()) {
      void state.assetDiscoverySweepService.runIfDue();
    }
  },
};

// Requests queued during start-up share this first read, so a storage failure reaches them
// as soon as it is known; they are not held until a second read.
export const backgroundReady = cryptoWaitReady()
  .then(() => {
    void loadWalletStorage().catch(() => {});

    return backgroundRuntime;
  });
