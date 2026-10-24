import { openWebDatabase, WEB_STORE_NAME } from './WebDatabase';
import type { IState } from '@extension-base/background/types/types';

const storageItem = 'storageItem';

export class StorageWeb {
  openDatabase(): Promise<IDBDatabase> {
    return openWebDatabase();
  }

  async set(value: Partial<IState>): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(WEB_STORE_NAME);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB storage write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB storage write aborted'));
      const current = store.get(storageItem);
      current.onsuccess = () => store.put({ ...(current.result ?? {}), ...value }, storageItem);
    });
  }

  async get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readonly');
      const store = transaction.objectStore(WEB_STORE_NAME);
      const request = store.get(storageItem);

      request.onsuccess = (event) => {
        const filtered = key.reduce((acc, key) => {
          const result = (event.target as IDBRequest).result;
          acc[key] = result ? result[key] ?? {} : {};

          return acc;
        }, {} as Pick<IState, (typeof key)[number]>);
        resolve(filtered);
      };

      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }
}
