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

  set(value: Partial<IState>): void {
    this.openDatabase().then((db) => {
      const transaction = db.transaction(db_name, 'readwrite');
      const store = transaction.objectStore(db_name);
      store.put(value, storageItem);
    });
  }

  get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((db) => {
        const transaction = db.transaction(db_name, 'readonly');
        const store = transaction.objectStore(db_name);
        const request = store.get(storageItem);

        request.onsuccess = (event) => {
          const payload = (event.target as IDBRequest).result as unknown;
          let sanitizedPayload: Record<string, unknown> = {};

          if (payload && typeof payload === 'object') {
            sanitizedPayload = payload as Record<string, unknown>;
          } else if (payload !== undefined && payload !== null) {
            console.warn('StorageWeb.get: invalid IndexedDB payload, clearing entry');
            void this.openDatabase().then((db) => {
              const cleanupTx = db.transaction(db_name, 'readwrite');
              cleanupTx.objectStore(db_name).delete(storageItem);
            });
          }

          const filtered = key.reduce(
            (acc, key) => {
              const value = sanitizedPayload[key as string];
              acc[key] = (value !== undefined && value !== null ? value : {}) as IState[(typeof key)[number]];

              return acc;
            },
            {} as Pick<IState, (typeof key)[number]>
          );
          resolve(filtered);
        };

        request.onerror = (event) => reject((event.target as IDBRequest).error);
      });
    });
  }
}
