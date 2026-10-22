export const WEB_DATABASE_NAME = 'fw-wallet';
export const WEB_STORE_NAME = 'fw-wallet';

let connection: Promise<IDBDatabase> | undefined;

function openRequest(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined
      ? indexedDB.open(WEB_DATABASE_NAME)
      : indexedDB.open(WEB_DATABASE_NAME, version);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) db.createObjectStore(WEB_STORE_NAME);
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Wallet database could not be opened.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other wallet windows and try again to update wallet storage.'));
    };
  });
}

async function openWithSchema(): Promise<IDBDatabase> {
  let db = await openRequest();
  if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
    // Older enumeration code could create version 1 without its object store.
    // Upgrade only that malformed schema; never delete databases or records.
    const version = db.version + 1;
    db.close();
    try {
      db = await openRequest(version);
    } catch (error) {
      // Another context may have completed the repair while this one waited.
      if (!(error instanceof DOMException) || error.name !== 'VersionError') throw error;
      db = await openRequest();
    }
  }
  if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
    db.close();
    throw new Error('Wallet database schema is unavailable.');
  }
  db.onversionchange = () => {
    connection = undefined;
    db.close();
  };
  return db;
}

export function openWebDatabase(): Promise<IDBDatabase> {
  if (!connection) {
    connection = openWithSchema().catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}
