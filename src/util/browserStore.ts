type StoredValue = unknown;

const memoryStore = new Map<string, StoredValue>();

function getLocalStorage(): Storage | undefined {
  try {
    const storage = globalThis.window?.localStorage ?? globalThis.localStorage;
    const testKey = '__fearless_store_test__';

    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);

    return storage;
  } catch {
    return undefined;
  }
}

function deserialize(value: string | null): StoredValue {
  if (value === null) return undefined;

  try {
    return JSON.parse(value) as StoredValue;
  } catch {
    return value;
  }
}

function serialize(value: StoredValue): string {
  return JSON.stringify(value);
}

const browserStore = {
  get enabled() {
    return Boolean(getLocalStorage()) || memoryStore.size >= 0;
  },

  get disabled() {
    return !this.enabled;
  },

  get<T = StoredValue>(key: string, fallback?: T): T | undefined {
    const storage = getLocalStorage();
    const value = storage ? deserialize(storage.getItem(key)) : memoryStore.get(key);

    return (value === undefined ? fallback : value) as T | undefined;
  },

  set<T = StoredValue>(key: string, value: T): T {
    const storage = getLocalStorage();

    if (storage) storage.setItem(key, serialize(value));
    else memoryStore.set(key, value);

    return value;
  },

  remove(key: string): void {
    const storage = getLocalStorage();

    if (storage) storage.removeItem(key);
    else memoryStore.delete(key);
  },

  each(callback: (value: StoredValue, key: string) => void): void {
    const storage = getLocalStorage();

    if (!storage) {
      memoryStore.forEach((value, key) => callback(value, key));

      return;
    }

    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);

      if (key) callback(deserialize(storage.getItem(key)), key);
    }
  },

  clearAll(): void {
    const storage = getLocalStorage();

    if (storage) storage.clear();
    else memoryStore.clear();
  },
};

export default browserStore;
