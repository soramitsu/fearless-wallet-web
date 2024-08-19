// import { chrome } from '@extension-base/utils/crossenv';
export default class WalletConnectStorage {
  getKeys(): Promise<string[]> {
    return new Promise(() => {
      // chrome.storage.local.get(null).then((values) => {
      //   res(Object.keys(values));
      // });
      return [];
    });
  }

  getEntries<T = unknown>(): Promise<[string, T][]> {
    return new Promise(() => {
      // chrome.storage.local.get(null).then((values) => {
      //   res(Object.entries(values));
      // });
      return [];
    });
  }

  getItem<T = unknown>(): Promise<T | undefined> {
    return new Promise(() => {
      // chrome.storage.local.get(key).then((values) => {
      //   res(values[key]);
      // });
      return undefined;
    });
  }

  setItem(): Promise<void> {
    // return chrome.storage.local.set({ [key]: value });
    return Promise.resolve();
  }

  removeItem(): Promise<void> {
    // return chrome.storage.local.remove(key);
    return Promise.resolve();
  }
}
