import { EXTENSION_PREFIX } from '../defaults';
import BaseExtensionStore from './BaseExtension';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

class PasswordRecordStore extends BaseExtensionStore<KeyringPasswordJson> {}

// Share the extension mutation queue with encrypted accounts. The handler's
// flush acknowledges the password record and every associated account write.
export default class KeyringStore implements PasswordStore {
  private readonly store = new PasswordRecordStore(EXTENSION_PREFIX);

  public get(update: (value: KeyringPasswordJson) => void): void {
    this.store.get('keyring', update);
  }

  public remove(update?: () => void): void {
    this.store.remove('keyring', update);
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    this.store.set('keyring', value, update);
  }
}
