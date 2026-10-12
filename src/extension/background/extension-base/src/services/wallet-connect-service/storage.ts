import { chrome } from '@extension-base/utils/crossenv';

//TODO: make it work on both platforms
export default class WalletConnectStorage {
  async getKeys(): Promise<string[]> {
    const values = (await chrome.storage.local.get(null)) as unknown as Record<string, unknown>;
    return Object.keys(values);
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    const values = (await chrome.storage.local.get(null)) as unknown as Record<string, T>;
    return Object.entries(values);
  }

  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    const values = await chrome.storage.local.get(key);
    return values[key] as T | undefined;
  }

  setItem<T = unknown>(key: string, value: T): Promise<void> {
    return chrome.storage.local.set({ [key]: value });
  }

  removeItem(key: string): Promise<void> {
    return chrome.storage.local.remove(key);
  }
}
