import { chrome } from '@extension-base/utils/crossenv';

type StoreValue = Record<string, unknown>;

const lastError = (type: string): void => {
  const error = chrome.runtime.lastError;

  if (error) console.error(`BaseExtensionStore.${type}:: runtime.lastError:`, error);
};

export default abstract class BaseExtensionStore<T> {
  readonly prefix: string;

  constructor(prefix: string | null) {
    this.prefix = prefix ? `${prefix}:` : '';
  }

  public getPrefix(): string {
    return this.prefix;
  }

  public all(update: (key: string, value: T) => void): void {
    const cb1 = ([key, value]: [string, T]) => update(key, value);
    const cb2 = (map: Record<string, T>) => Object.entries(map).forEach(cb1);

    this.allMap(cb2);
  }

  public allMap(update: (value: Record<string, T>) => void): void {
    chrome.storage.local.get(null, (result: StoreValue) => {
      lastError('all');

      const map: Record<string, T> = {};

      for (const [key, value] of Object.entries(result)) {
        if (!key.startsWith(this.prefix)) continue;

        const strippedKey = key.replace(this.prefix, '');

        if (value === undefined || value === null) {
          console.warn(`BaseExtensionStore.allMap: skipping invalid entry for key ${key}`);
          chrome.storage.local.remove(key, () => lastError('remove-invalid'));
          continue;
        }

        map[strippedKey] = value as T;
      }

      update(map);
    });
  }

  public get(_key: string, update: (value: T) => void): void {
    const key = `${this.prefix}${_key}`;

    chrome.storage.local.get([key], (result: StoreValue) => {
      lastError('get');
      const entry = result[key];

      if (entry === undefined || entry === null) {
        console.warn(`BaseExtensionStore.get: missing entry for key ${key}`);
        chrome.storage.local.remove(key, () => lastError('remove-missing'));
        update({} as T);

        return;
      }

      update(entry as T);
    });
  }

  public remove(_key: string, update?: () => void): void {
    const key = `${this.prefix}${_key}`;

    chrome.storage.local.remove(key, () => {
      lastError('remove');

      update?.();
    });
  }

  public set(_key: string, value: T, update?: () => void): void {
    const key = `${this.prefix}${_key}`;

    chrome.storage.local.set({ [key]: value }, () => {
      lastError('set');

      update?.();
    });
  }
}
