import { EXTENSION_PREFIX } from '../defaults';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

const FEARLESS_KEYRING = `${EXTENSION_PREFIX}:keyring`;

export default class KeyringStoreWeb implements PasswordStore {
  public get(update: (value: KeyringPasswordJson) => void): void {
    const raw = localStorage.getItem(FEARLESS_KEYRING);

    if (!raw) {
      update?.({} as KeyringPasswordJson);

      return;
    }

    try {
      const keyring = JSON.parse(raw) as KeyringPasswordJson;
      update?.(keyring);
    } catch (error) {
      console.warn('KeyringStoreWeb.get: failed to parse keyring payload', error);
      this.remove();
      update?.({} as KeyringPasswordJson);
    }
  }

  public remove(update?: () => void): void {
    localStorage.removeItem(FEARLESS_KEYRING);

    update?.();
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    localStorage.setItem(FEARLESS_KEYRING, JSON.stringify(value));

    update?.();
  }
}
