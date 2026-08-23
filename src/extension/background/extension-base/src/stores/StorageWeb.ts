import type { IState } from '@extension-base/background/types/types';

const storageItem = 'storageItem';
const db_name = 'fw-wallet';

export class StorageWeb {
  openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(db_name, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore(db_name);
      };

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
  }

  async set(value: Partial<IState>): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(db_name, 'readwrite');
      const store = transaction.objectStore(db_name);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB storage write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB storage write aborted'));
      store.put(value, storageItem);
    });
  }

  async get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(db_name, 'readonly');
      const store = transaction.objectStore(db_name);
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
