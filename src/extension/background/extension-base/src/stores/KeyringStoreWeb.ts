import { PASSWORD_STORAGE_KEY, readWalletRecords, removeWalletRecords, writeWalletRecords } from './WalletStorage';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

export default class KeyringStoreWeb implements PasswordStore {
  private static value: KeyringPasswordJson | null = null;
  private static pending = Promise.resolve();

  static async initialize(): Promise<void> {
    const records = await readWalletRecords();
    this.value = (records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson | undefined) ?? null;
  }

  static applyCommittedPassword(value: KeyringPasswordJson | null): void {
    this.value = value;
  }

  static async flush(): Promise<void> {
    const pending = this.pending;
    try {
      await pending;
    } finally {
      // A failed batch is reported to its waiting requests; subsequent retries
      // may enqueue a fresh batch after that failure has been observed.
      if (this.pending === pending) this.pending = Promise.resolve();
    }
  }

  public get(update: (value: KeyringPasswordJson) => void): void {
    update(KeyringStoreWeb.value);
  }

  public remove(update?: () => void): void {
    KeyringStoreWeb.pending = KeyringStoreWeb.pending.then(() => removeWalletRecords([PASSWORD_STORAGE_KEY])).then(() => {
      KeyringStoreWeb.value = null;
      update?.();
    });
    void KeyringStoreWeb.pending.catch(() => {});
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    KeyringStoreWeb.pending = KeyringStoreWeb.pending.then(() => writeWalletRecords({ [PASSWORD_STORAGE_KEY]: value })).then(() => {
      KeyringStoreWeb.value = value;
      update?.();
    });
    void KeyringStoreWeb.pending.catch(() => {});
  }
}
