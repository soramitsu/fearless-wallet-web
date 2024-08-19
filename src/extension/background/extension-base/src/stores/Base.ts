// import { chrome } from '@extension-base/utils/crossenv';

const db_name = 'data-store';

export default abstract class BaseStore<T> {
  #prefix: string;

  constructor(prefix: string | null) {
    this.#prefix = prefix ? `${prefix}:` : '';
  }

  public getPrefix(): string {
    return this.#prefix;
  }

  public all(update: (key: string, value: T) => void): void {
    const cb1 = ([key, value]: [string, T]) => update(key, value);
    const cb2 = (map: Record<string, T>) => Object.entries(map).forEach(cb1);

    this.allMap(cb2);
  }

  public openDatabase(): Promise<IDBDatabase> {
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

  public writeToDB(key: string, value: T): void {
    this.openDatabase().then((db) => {
      const transaction = db.transaction(db_name, 'readwrite');
      const store = transaction.objectStore(db_name);
      !(value instanceof Promise) && store.put(value, key);
    });
  }

  public readFromDB(key: string): Promise<unknown> {
    return key === 'ALL' ? this.getAllItemsWithKeys() : this.getByKey(key);
  }

  public getByKey(key: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((db) => {
        const transaction = db.transaction(db_name, 'readonly');
        const store = transaction.objectStore(db_name);
        const request = store.get(key);

        request.onsuccess = (event) => {
          resolve((event.target as IDBRequest).result);
        };

        request.onerror = (event) => reject((event.target as IDBRequest).error);
      });
    });
  }

  public getAllItemsWithKeys() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('my-database');

      request.onerror = (event) => {
        console.error('Error opening database:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBRequest).result;
        const transaction = db.transaction(db_name, 'readonly');
        const objectStore = transaction.objectStore(db_name);
        const items: { key: IDBValidKey; value: T }[] = [];

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        objectStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;

          if (cursor) {
            items.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          } else {
            resolve(items);
          }
        };

        transaction.onerror = () => {
          console.error('Transaction failed:', transaction.error);
          reject(transaction.error);
        };
      };
    });
  }

  public removeFromDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((db) => {
        const transaction = db.transaction(db_name, 'readwrite');
        const store = transaction.objectStore(db_name);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject((event.target as IDBRequest).error);
      });
    });
  }

  public async allMap(update: (value: Record<string, T>) => void): Promise<void> {
    // lastError('all');

    const all = await this.readFromDB('ALL');
    const entries = Object.entries(all || {});
    if (!entries) return;

    const map: Record<string, T> = {};

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];

      if (key.startsWith(this.#prefix)) map[key.replace(this.#prefix, '')] = value as T;
    }

    update(map);

    // chrome.storage.local.get(null, (result: StoreValue) => {
    //   lastError('all');
    //
    //   const entries = Object.entries(result);
    //   const map: Record<string, T> = {};
    //
    //   for (let i = 0; i < entries.length; i++) {
    //     const [key, value] = entries[i];
    //
    //     if (key.startsWith(this.#prefix)) map[key.replace(this.#prefix, '')] = value as T;
    //   }
    //
    //   update(map);
    // });
  }

  public get(_key: string, update: (value: T) => void): void {
    const key = `${this.#prefix}${_key}`;

    const value = this.readFromDB(key);
    // lastError('get');
    update(value as T);

    // chrome.storage.local.get([key], (result: StoreValue) => {
    //   lastError('get');
    //
    //   update(result[key] as T);
    // });
  }

  public remove(_key: string, update?: () => void): void {
    const key = `${this.#prefix}${_key}`;

    this.removeFromDB(key);
    // lastError('remove');
    update?.();

    // chrome.storage.local.remove(key, () => {
    //   lastError('remove');
    //
    //   update?.();
    // });
  }

  public set(_key: string, value: T, update?: () => void): void {
    const key = `${this.#prefix}${_key}`;
    this.writeToDB(key, value);
    // lastError('set');
    update?.();

    // chrome.storage.local.set({ [key]: value }, () => {
    //   lastError('set');
    //
    //   update?.();
    // });
  }
}
