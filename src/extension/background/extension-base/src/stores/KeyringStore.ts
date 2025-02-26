import { EXTENSION_PREFIX } from '../defaults';
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

  public remove(update?: () => void): void {
    chrome.storage.local.remove(FEARLESS_KEYRING, (): void => {
      lastError('remove');

      update?.();
    });
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    chrome.storage.local.set({ [FEARLESS_KEYRING]: value }, (): void => {
      lastError('set');

      update?.();
    });
  }
}
