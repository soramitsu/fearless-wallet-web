// import { chrome } from '@extension-base/utils/crossenv';
import type { IState } from '@extension-base/background/types/types';

const storageItem = 'storageItem';
const db_name = 'data-store';

class Storage {
  openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('my-database', 1);

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

  get(filterKeys: (keyof IState)[]): Promise<Pick<IState, (typeof filterKeys)[number]>> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((db) => {
        const transaction = db.transaction(db_name, 'readonly');
        const store = transaction.objectStore(db_name);
        const request = store.get(filterKeys);

        const promises = filterKeys.map((key) => {
          return new Promise<{ key: IDBValidKey; value: any }>((resolvePromise, rejectPromise) => {
            const getRequest = store.get(key);

            getRequest.onerror = () => {
              rejectPromise(getRequest.error);
            };

            getRequest.onsuccess = () => {
              resolvePromise({ key, value: getRequest.result });
            };
          });
        });

        Promise.all(promises)
          .then((results) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            resolve(results);
          })
          .catch((error) => reject(error));

        request.onsuccess = (event) => resolve((event.target as IDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBRequest).error);
      });
    });
  }
}

export const storage = new Storage();

export async function initStorage() {
  const { authUrls, addressBook, selectedNetworks } = await storage.get([
    'authUrls',
    'addressBook',
    'selectedNetworks',
  ]);

  const obj: Record<string, unknown> = {
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    providers: {},
  };

  if (authUrls === undefined) obj.authUrls = {};
  if (selectedNetworks === undefined) obj.selectedNetworks = {};
  if (addressBook === undefined) obj.addressBook = {};

  await storage.set(obj);
}
