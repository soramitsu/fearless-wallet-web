import { chrome } from '@extension-base/utils/crossenv';

//TODO: make it work on both platforms
export default class WalletConnectStorage {
  getKeys(): Promise<string[]> {
    return new Promise((res) => {
      (chrome.storage.local.get(null) as unknown as Promise<Record<string, unknown>>).then((values) => {
        res(Object.keys(values));
      });
    });
  }

  getEntries<T = unknown>(): Promise<[string, T][]> {
    return new Promise((res) => {
      (chrome.storage.local.get(null) as unknown as Promise<Record<string, T>>).then((values) => {
        res(Object.entries(values));
      });
    });
  }

  getItem<T = unknown>(key: string): Promise<T | undefined> {
    return new Promise((res) => {
      chrome.storage.local.get(key).then((values) => {
        res(values[key] as T | undefined);
      });
    });
  }

  setItem<T = unknown>(key: string, value: T): Promise<void> {
    return chrome.storage.local.set({ [key]: value });
  }

  removeItem(key: string): Promise<void> {
    return chrome.storage.local.remove(key);
  }
}
