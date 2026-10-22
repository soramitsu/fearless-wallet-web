import { PASSWORD_STORAGE_KEY, readWalletRecords, writeWalletRecords } from './WalletStorage';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

export default class KeyringStoreWeb implements PasswordStore {
  public get(update: (value: KeyringPasswordJson) => void): void {
    void readWalletRecords().then((records) => update(records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson));
  }

  public remove(update?: () => void): void {
    // Keep a tombstone so a failed localStorage cleanup cannot resurrect a verifier.
    void writeWalletRecords({ [PASSWORD_STORAGE_KEY]: null }).then(() => update?.());
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    void writeWalletRecords({ [PASSWORD_STORAGE_KEY]: value }).then(() => update?.());
  }
}
