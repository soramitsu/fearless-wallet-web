import { decodeWebPassword, loadWebPasswordRecord, WEB_PASSWORD_RECORD_KEY, WebPasswordStore } from './WebPasswordRecord';
import { assertWebStorageWritable, webStorageMode } from './WebStorageMode';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';

export default class KeyringStoreWeb implements PasswordStore {
  private static value: KeyringPasswordJson | null = null;
  private static pending = Promise.resolve();
  static get readOnly(): boolean { return webStorageMode.recoveryOnly; }
  static set readOnly(value: boolean) { webStorageMode.recoveryOnly = value; }

  static async initialize(): Promise<void> {
    const { record, persisted } = await loadWebPasswordRecord();
    this.value = decodeWebPassword(record.serialized);
    this.readOnly = !persisted;
  }

  static assertWritable(): void {
    assertWebStorageWritable();
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
    this.write(null, update);
  }

  // Reset writes its null tombstone in the same transaction as account archives.
  // Preparation never changes the durable or in-memory password.
  static async removeForReset(): Promise<void> {
    await this.flush();
    this.assertWritable();
  }

  static commitPassword(value: KeyringPasswordJson): void {
    this.value = value;
  }

  static commitReset(): void {
    this.value = null;
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    this.write(value, update);
  }

  private write(value: KeyringPasswordJson | null, update?: () => void): void {
    const serialized = value === null ? null : JSON.stringify(value);
    KeyringStoreWeb.pending = KeyringStoreWeb.pending.then(async () => {
      KeyringStoreWeb.assertWritable();
      decodeWebPassword(serialized);
      await new WebPasswordStore().replaceAndWait({ [WEB_PASSWORD_RECORD_KEY]: { version: 1, serialized } }, [], false);
      KeyringStoreWeb.value = value;
      update?.();
    });
    void KeyringStoreWeb.pending.catch(() => {});
  }
}
