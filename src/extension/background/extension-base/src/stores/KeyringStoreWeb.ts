import { EXTENSION_PREFIX } from '../defaults';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

const FEARLESS_KEYRING = `${EXTENSION_PREFIX}:keyring`;

export default class KeyringStoreWeb implements PasswordStore {
  public get(update: (value: KeyringPasswordJson) => void): void {
    const keyring = JSON.parse(localStorage.getItem(FEARLESS_KEYRING) || '') as KeyringPasswordJson;
    update?.(keyring);
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
