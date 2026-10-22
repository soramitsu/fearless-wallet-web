import { chrome } from '@extension-base/utils/crossenv';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { IS_EXTENSION } from '@/consts/global';

export const PASSWORD_STORAGE_KEY = `${EXTENSION_PREFIX}:keyring`;
const DATABASE = 'fw-wallet';

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DATABASE)) request.result.createObjectStore(DATABASE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Cannot open wallet storage'));
  });
}

export async function readWalletRecords(): Promise<Record<string, unknown>> {
  if (IS_EXTENSION) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (records) => {
        if (chrome.runtime.lastError) reject(new Error('Cannot read wallet storage'));
        else resolve(records);
      });
    });
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const records: Record<string, unknown> = {};
    const transaction = db.transaction(DATABASE, 'readonly');
    const request = transaction.objectStore(DATABASE).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor) {
        records[String(cursor.key)] = cursor.value;
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      db.close();

      try {
        // Existing web installs kept the verifier in localStorage. Once migrated,
        // the IndexedDB verifier always wins, even after a crash during cleanup.
        if (!Object.prototype.hasOwnProperty.call(records, PASSWORD_STORAGE_KEY)) {
          const legacy = localStorage.getItem(PASSWORD_STORAGE_KEY);

          if (legacy) records[PASSWORD_STORAGE_KEY] = JSON.parse(legacy);
        }

        resolve(records);
      } catch {
        reject(new Error('Cannot read wallet password record'));
      }
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(new Error('Cannot read wallet storage'));
    };
  });
}

// Persist the verifier and every changed encrypted account as one batch. Never
// publish new in-memory keys until the browser confirms the batch committed.
export async function writeWalletRecords(records: Record<string, unknown>): Promise<void> {
  if (IS_EXTENSION) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(records, () => {
        if (chrome.runtime.lastError) reject(new Error('Cannot save wallet storage'));
        else resolve();
      });
    });
  }

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DATABASE, 'readwrite');
    const objectStore = transaction.objectStore(DATABASE);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(new Error('Cannot save wallet storage'));
    };

    try {
      Object.entries(records).forEach(([key, value]) => objectStore.put(value, key));
    } catch {
      transaction.abort();
    }
  });

  if (Object.prototype.hasOwnProperty.call(records, PASSWORD_STORAGE_KEY)) {
    // Cleanup is optional: a committed IndexedDB value is already authoritative.
    try {
      localStorage.removeItem(PASSWORD_STORAGE_KEY);
    } catch {
      // A storage policy may prevent cleanup without affecting the committed data.
    }
  }
}
