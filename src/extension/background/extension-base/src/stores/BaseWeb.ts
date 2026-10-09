import { openWebDatabase, WEB_STORE_NAME } from './WebDatabase';

export default abstract class BaseWebStore<T> {
  #prefix: string;
  private static writeQueue: Promise<void> = Promise.resolve();
  private static pendingWrites: Promise<void> = Promise.resolve();

  public static async flush(): Promise<void> {
    const pending = BaseWebStore.pendingWrites;
    try {
      await pending;
    } finally {
      // Every concurrent waiter observes this batch's error before it is cleared.
      if (BaseWebStore.pendingWrites === pending) BaseWebStore.pendingWrites = Promise.resolve();
    }
  }

  private enqueueWrite<TResult>(write: () => Promise<TResult>, trackFailure = true): Promise<TResult> {
    const operation = BaseWebStore.writeQueue.then(write);
    BaseWebStore.writeQueue = operation.then(() => {}, () => {});
    if (!trackFailure) return operation;
    BaseWebStore.pendingWrites = Promise.allSettled([BaseWebStore.pendingWrites, operation]).then((results) => {
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure) throw failure.reason;
    });
    void BaseWebStore.pendingWrites.catch(() => {});
    return operation;
  }

  constructor(prefix: string | null) {
    this.#prefix = prefix ? `${prefix}:` : '';
  }

  public getPrefix(): string {
    return this.#prefix;
  }

  public async all(update: (key: string, value: T) => void): Promise<void> {
    const cb1 = ([key, value]: [string, T]) => update(key, value);
    const cb2 = (map: Record<string, T>) => Object.entries(map).forEach(cb1);

    await this.allMap(cb2);
  }

  public openDatabase(): Promise<IDBDatabase> {
    return openWebDatabase();
  }

  public writeToDB(key: string, value: T): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Wallet account write failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Wallet account write was aborted.'));
        transaction.objectStore(WEB_STORE_NAME).put(value, key);
      });
    });
  }

  public readFromDB(key: string): Promise<unknown> {
    return key === 'ALL' ? this.getAllItemsWithKeys() : this.getByKey(key);
  }

  public async getByKey(key: string): Promise<T | undefined> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readonly');
      const request = transaction.objectStore(WEB_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Wallet account read was aborted.'));
    });
  }

  public async getAllItemsWithKeys(): Promise<{ key: IDBValidKey; value: T }[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readonly');
      const objectStore = transaction.objectStore(WEB_STORE_NAME);
      const items: { key: IDBValidKey; value: T }[] = [];

      objectStore.openCursor().onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest)?.result;

        if (cursor) {
          items.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(items);
        }
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Wallet account enumeration was aborted.'));
    });
  }

  public removeFromDB(key: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Wallet account removal failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Wallet account removal was aborted.'));
        transaction.objectStore(WEB_STORE_NAME).delete(key);
      });
    });
  }

  public async allMap(update: (value: Record<string, T>) => void): Promise<void> {
    const map: Record<string, T> = {};

    const entries = await this.getAllItemsWithKeys();
    for (const { key, value } of entries) {
      if (typeof key === 'string' && key.startsWith(this.#prefix)) {
        map[key.slice(this.#prefix.length)] = value;
      }
    }

    update(map);
  }

  public get(_key: string, update: (value: T) => void): void {
    const key = `${this.#prefix}${_key}`;

    this.readFromDB(key)
      .then((value) => update(value as T))
      .catch((error) => console.error('Error reading from database:', error));
  }

  public remove(_key: string, update?: () => void): void {
    const key = `${this.#prefix}${_key}`;

    void this.removeFromDB(key).then(() => update?.()).catch(() => {});
  }

  public set(_key: string, value: T, update?: () => void): void {
    const key = `${this.#prefix}${_key}`;

    void this.writeToDB(key, value).then(() => update?.()).catch(() => {});
  }

  public getAndWait(key: string): Promise<T | undefined> {
    return this.enqueueWrite(() => this.getByKey(`${this.#prefix}${key}`), false);
  }

  // Keep the read and write in one transaction. The callback publishes only
  // after commit, while the same queue still excludes password/deletion writes.
  public updateAndWait(
    key: string,
    transform: (current: T | undefined) => T | undefined,
    publish?: (committed: T) => void,
    trackFailure = true
  ): Promise<T | undefined> {
    return this.enqueueWrite(async () => {
      const db = await this.openDatabase();
      return new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
        let next: T | undefined;
        transaction.oncomplete = () => {
          try {
            if (next !== undefined) publish?.(next);
            resolve(next);
          } catch (error) { reject(error); }
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Wallet metadata write failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Wallet metadata write was aborted.'));
        const store = transaction.objectStore(WEB_STORE_NAME);
        const request = store.get(`${this.#prefix}${key}`);
        request.onsuccess = () => {
          try {
            next = transform(request.result as T | undefined);
            if (next !== undefined) store.put(next, `${this.#prefix}${key}`);
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
      });
    }, trackFailure);
  }

  public setAndWait(key: string, value: T): Promise<void> {
    return this.writeToDB(`${this.#prefix}${key}`, value);
  }
}
