import { browser, chrome } from '@extension-base/utils/crossenv';

type StorageArea = typeof chrome.storage.local;

const storage: StorageArea = (browser?.storage?.local ?? chrome.storage.local) as StorageArea;
const runtime = browser?.runtime ?? chrome.runtime;

const promisify = <T>(method: StorageArea[keyof StorageArea], args: unknown[]): Promise<T> => {
  const fn = method as (...params: unknown[]) => unknown;
  const supportsCallback = typeof fn === 'function' && fn.length > args.length;

  if (supportsCallback) {
    return new Promise<T>((resolve, reject) => {
      try {
        fn.call(storage, ...args, (result: unknown) => {
          const error = runtime?.lastError;

          if (error) {
            reject(new Error(error.message));

            return;
          }

          resolve(result as T);
        });
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  try {
    const maybePromise = fn.apply(storage, args) as Promise<T>;

    if (maybePromise && typeof maybePromise.then === 'function') {
      return maybePromise;
    }

    return Promise.resolve(maybePromise);
  } catch (error) {
    return Promise.reject(error as Error);
  }
};

const getAll = async <T = Record<string, unknown>>(): Promise<T> => {
  if (storage.get.length > 0) {
    return promisify<T>(storage.get, [null]);
  }

  return promisify<T>(storage.get, []);
};

const getValue = async <T = unknown>(key: string): Promise<T | undefined> => {
  if (storage.get.length > 1) {
    const result = await promisify<Record<string, T>>(storage.get, [key]);

    return result[key];
  }

  const result = await promisify<Record<string, T>>(storage.get, [key]);

  return result?.[key];
};

const setValue = <T = unknown>(key: string, value: T): Promise<void> => {
  return promisify<void>(storage.set, [{ [key]: value }]);
};

const removeValue = (key: string): Promise<void> => {
  return promisify<void>(storage.remove, [key]);
};

export default class WalletConnectStorage {
  async getKeys(): Promise<string[]> {
    const values = await getAll<Record<string, unknown>>();

    return Object.keys(values);
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    const values = await getAll<Record<string, T>>();

    return Object.entries(values);
  }

  getItem<T = unknown>(key: string): Promise<T | undefined> {
    return getValue<T>(key);
  }

  setItem<T = unknown>(key: string, value: T): Promise<void> {
    return setValue(key, value);
  }

  removeItem(key: string): Promise<void> {
    return removeValue(key);
  }
}
