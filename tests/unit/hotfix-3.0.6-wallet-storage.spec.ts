/** @jest-environment node */
import { chrome } from '@extension-base/utils/crossenv';
import {
  flushWalletWrites,
  readWalletRecords,
  removeWalletRecords,
  scheduleWalletWrite,
  writeWalletRecords,
} from '@extension-base/stores/WalletStorage';

jest.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
jest.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: {},
    storage: { local: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete chrome.runtime.lastError;
});

describe('Chrome wallet storage batches', () => {
  it('rejects a read error instead of returning an empty wallet', async () => {
    (chrome.storage.local.get as jest.Mock).mockImplementation((_keys, callback) => {
      chrome.runtime.lastError = { message: 'Synthetic read error' };
      callback({});
      delete chrome.runtime.lastError;
    });
    await expect(readWalletRecords()).rejects.toThrow('Cannot read wallet storage');
  });

  it('waits for the single batch acknowledgment before resolving', async () => {
    let acknowledge!: () => void;
    const values = {
      'fw:keyring': { passwordHash: 'synthetic hash' },
      'fw:account:fixture': { encoded: 'synthetic cipher' },
      'fw:ton:fixture': { cipherSeed: 'synthetic TON cipher' },
    };

    (chrome.storage.local.set as jest.Mock).mockImplementation((_values, callback) => {
      acknowledge = callback;
    });
    let completed = false;
    const save = writeWalletRecords(values).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect((chrome.storage.local.set as jest.Mock).mock.calls[0][0]).toEqual(values);
    acknowledge();
    await save;
    expect(completed).toBe(true);
  });

  it('rejects a quota failure and preserves the previous durable batch', async () => {
    const persisted = {
      'fw:keyring': { passwordHash: 'old synthetic hash' },
      'fw:ton:fixture': { cipherSeed: 'old synthetic cipher' },
    };
    const before = structuredClone(persisted);

    (chrome.storage.local.set as jest.Mock).mockImplementation((_values, callback) => {
      chrome.runtime.lastError = { message: 'Synthetic quota error' };
      callback();
      delete chrome.runtime.lastError;
    });
    await expect(
      writeWalletRecords({
        'fw:keyring': { passwordHash: 'new synthetic hash' },
        'fw:ton:fixture': { cipherSeed: 'new synthetic cipher' },
      })
    ).rejects.toThrow('Cannot save wallet storage');
    expect(persisted).toEqual(before);
  });
});

describe('queued keyring writes and removals', () => {
  it('runs queued writes in order; a flush resolves only after the last one', async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));

    scheduleWalletWrite(async () => {
      await first;
      order.push('first');
    });
    scheduleWalletWrite(async () => {
      order.push('second');
    });
    const flushed = flushWalletWrites().then(() => order.push('flushed'));

    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await flushed;
    expect(order).toEqual(['first', 'second', 'flushed']);
  });

  it('reports a failed queued write once, after still running its callback', async () => {
    const update = jest.fn();

    scheduleWalletWrite(async () => {
      throw new Error('Synthetic write failure');
    }, update);
    await expect(flushWalletWrites()).rejects.toThrow('An earlier wallet write failed');
    expect(update).toHaveBeenCalledTimes(1);
    await expect(flushWalletWrites()).resolves.toBeUndefined();
  });

  it('removes every given record in one storage call and rejects on a storage error', async () => {
    (chrome.storage.local.remove as jest.Mock).mockImplementation((_keys, callback) => callback());
    await removeWalletRecords(['fw:keyring', 'fw:account:fixture', 'fw:ton:fixture']);
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(1);
    expect((chrome.storage.local.remove as jest.Mock).mock.calls[0][0]).toEqual([
      'fw:keyring',
      'fw:account:fixture',
      'fw:ton:fixture',
    ]);

    (chrome.storage.local.remove as jest.Mock).mockImplementation((_keys, callback) => {
      chrome.runtime.lastError = { message: 'Synthetic remove error' };
      callback();
      delete chrome.runtime.lastError;
    });
    await expect(removeWalletRecords(['fw:keyring'])).rejects.toThrow('Cannot save wallet storage');
  });
});
