import { EXTENSION_PREFIX } from '../defaults';
import { removeWalletRecords, scheduleWalletWrite, writeWalletRecords } from './WalletStorage';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

type StoreValue = Record<string, unknown>;

const FEARLESS_KEYRING = `${EXTENSION_PREFIX}:keyring`;

const lastError = (type: string): void => {
  const error = chrome.runtime.lastError;

  if (error) {
    console.error(`KeyringStore.${type}:: runtime.lastError:`, error);
  }
};

export default class KeyringStore implements PasswordStore {
  public get(update: (value: KeyringPasswordJson) => void): void {
    chrome.storage.local.get([FEARLESS_KEYRING], (result: StoreValue): void => {
      lastError('get');

      update(result[FEARLESS_KEYRING] as KeyringPasswordJson);
    });
  }

  // Queued so a password change or reset can wait for the verifier write (see scheduleWalletWrite).
  public remove(update?: () => void): void {
    scheduleWalletWrite(() => removeWalletRecords([FEARLESS_KEYRING]), update);
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    scheduleWalletWrite(() => writeWalletRecords({ [FEARLESS_KEYRING]: value }), update);
  }
}
