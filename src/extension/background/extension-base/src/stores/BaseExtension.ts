import { chrome } from '@extension-base/utils/crossenv';

type StoreValue = Record<string, unknown>;

const lastError = (type: string): void => {
  const error = chrome.runtime.lastError;

  if (error) console.error(`BaseExtensionStore.${type}:: runtime.lastError:`, error);
};

export default abstract class BaseExtensionStore<T> {
  readonly prefix: string;
  private static writeQueue: Promise<void> = Promise.resolve();
  private static pendingWrites: Promise<void> = Promise.resolve();

  public static async flush(): Promise<void> {
    const pending = BaseExtensionStore.pendingWrites;
    try { await pending; } finally {
      if (BaseExtensionStore.pendingWrites === pending) BaseExtensionStore.pendingWrites = Promise.resolve();
    }
  }

  private enqueueWrite<TResult>(write: () => Promise<TResult>, trackFailure = true): Promise<TResult> {
    const operation = BaseExtensionStore.writeQueue.then(write);
    BaseExtensionStore.writeQueue = operation.then(() => {}, () => {});
    if (trackFailure) {
      BaseExtensionStore.pendingWrites = Promise.allSettled([BaseExtensionStore.pendingWrites, operation]).then((results) => {
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) throw failure.reason;
      });
      void BaseExtensionStore.pendingWrites.catch(() => {});
    }
    return operation;
  }

  constructor(prefix: string | null) {
    this.prefix = prefix ? `${prefix}:` : '';
  }

  public getPrefix(): string {
    return this.prefix;
  }

  public all(update: (key: string, value: T) => void): void {
    const cb1 = ([key, value]: [string, T]) => update(key, value);
    const cb2 = (map: Record<string, T>) => Object.entries(map).forEach(cb1);

    this.allMap(cb2);
  }

  public allMap(update: (value: Record<string, T>) => void): void {
    chrome.storage.local.get(null, (result: StoreValue) => {
      lastError('all');

      const entries = Object.entries(result);
      const map: Record<string, T> = {};

      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];

        if (key.startsWith(this.prefix)) map[key.replace(this.prefix, '')] = value as T;
      }

      update(map);
    });
  }

  public get(_key: string, update: (value: T) => void): void {
    const key = `${this.prefix}${_key}`;

    chrome.storage.local.get([key], (result: StoreValue) => {
      lastError('get');

      update(result[key] as T);
    });
  }

  public remove(key: string, update?: () => void): void {
    void this.enqueueWrite(() => new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(`${this.prefix}${key}`, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Wallet account removal failed.'));
        else resolve();
      });
    })).then(() => update?.()).catch(console.error);
  }

  public set(key: string, value: T, update?: () => void): void {
    void this.setAndWait(key, value).then(() => update?.()).catch(console.error);
  }

  private write(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [`${this.prefix}${key}`]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Wallet account write failed.'));
        else resolve();
      });
    });
  }

  private read(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([`${this.prefix}${key}`], (result: StoreValue) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Wallet account read failed.'));
        else resolve(result[`${this.prefix}${key}`] as T | undefined);
      });
    });
  }

  public getAndWait(key: string): Promise<T | undefined> {
    return this.enqueueWrite(() => this.read(key), false);
  }

  public setAndWait(key: string, value: T): Promise<void> {
    return this.enqueueWrite(() => this.write(key, value));
  }

  public updateAndWait(
    key: string,
    transform: (current: T | undefined) => T | undefined,
    publish?: (committed: T) => void,
    trackFailure = true
  ): Promise<T | undefined> {
    return this.enqueueWrite(async () => {
      const next = transform(await this.read(key));
      if (next !== undefined) {
        await this.write(key, next);
        publish?.(next);
      }
      return next;
    }, trackFailure);
  }
}
