import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { PasswordStore } from '@subwallet/ui-keyring/types';
import { requestWebPasswordStorage } from '@/bootstrap/webPasswordStore';

export default class KeyringStoreWeb implements PasswordStore {
  private static value: KeyringPasswordJson | null = null;
  private static pending = Promise.resolve();

  static async initialize(): Promise<void> {
    const serialized = await requestWebPasswordStorage('get');
    this.value = serialized ? JSON.parse(serialized) : null;
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
    KeyringStoreWeb.pending = KeyringStoreWeb.pending.then(() => requestWebPasswordStorage('remove')).then(() => {
      KeyringStoreWeb.value = null;
      update?.();
    });
    void KeyringStoreWeb.pending.catch(() => {});
  }

  public set(value: KeyringPasswordJson, update?: () => void): void {
    KeyringStoreWeb.pending = KeyringStoreWeb.pending.then(() => requestWebPasswordStorage('set', JSON.stringify(value))).then(() => {
      KeyringStoreWeb.value = value;
      update?.();
    });
    void KeyringStoreWeb.pending.catch(() => {});
  }
}
