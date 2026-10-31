import { chrome } from '@extension-base/utils/crossenv';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { IS_EXTENSION } from '@/consts/global';

class WebSdkStore extends BaseWebStore<unknown> {}

export default class WalletConnectStorage {
  private readonly webStore = new WebSdkStore('fwWalletConnectSdk');

  async getKeys(): Promise<string[]> {
    if (!IS_EXTENSION) return Object.keys(await this.webStore.getAllAndWait());
    const values = (await chrome.storage.local.get(null)) as unknown as Record<string, unknown>;
    return Object.keys(values);
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    if (!IS_EXTENSION) return Object.entries(await this.webStore.getAllAndWait()) as [string, T][];
    const values = (await chrome.storage.local.get(null)) as unknown as Record<string, T>;
    return Object.entries(values);
  }

  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    if (!IS_EXTENSION) return await this.webStore.getAndWait(key) as T | undefined;
    const values = await chrome.storage.local.get(key);
    return values[key] as T | undefined;
  }

  setItem<T = unknown>(key: string, value: T): Promise<void> {
    if (!IS_EXTENSION) return this.webStore.setAndWait(key, value);
    return chrome.storage.local.set({ [key]: value });
  }

  removeItem(key: string): Promise<void> {
    if (!IS_EXTENSION) return this.webStore.replaceAndWait({}, [key]);
    return chrome.storage.local.remove(key);
  }
}

// The records a WalletConnect client restores when it starts. Both clients keep them under these keys.
const SDK_RECORDS = [
  'wc@2:client:0.3//session',
  'wc@2:client:0.3//proposal',
  'wc@2:core:0.3//pairing',
  'wc@2:core:0.3//subscription',
  'wc@2:core:0.3//history',
];

/** Whether a WalletConnect client has anything to restore: a session, proposal, pairing, subscription or history. */
export async function hasWalletConnectData(): Promise<boolean> {
  const storage = new WalletConnectStorage();
  const records = await Promise.all(SDK_RECORDS.map((key) => storage.getItem<unknown[]>(key)));

  return records.some((record) => !!(record ?? []).length);
}
