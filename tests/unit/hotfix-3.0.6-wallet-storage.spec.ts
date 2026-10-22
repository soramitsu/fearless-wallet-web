// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { chrome } from '@extension-base/utils/crossenv';
import { readWalletRecords, removeWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';

vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: {},
    storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  },
}));

const runtime = chrome.runtime as { lastError?: { message: string } };

beforeEach(() => {
  vi.clearAllMocks();
  delete runtime.lastError;
});

describe('Chrome wallet storage batches', () => {
  it('rejects a read error instead of returning an empty wallet', async () => {
    (chrome.storage.local.get as Mock).mockImplementation((_keys, callback) => {
      runtime.lastError = { message: 'Synthetic read error' };
      callback({});
      delete runtime.lastError;
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

    (chrome.storage.local.set as Mock).mockImplementation((_values, callback) => {
      acknowledge = callback;
    });
    let completed = false;
    const save = writeWalletRecords(values).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect((chrome.storage.local.set as Mock).mock.calls[0][0]).toEqual(values);
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

    (chrome.storage.local.set as Mock).mockImplementation((_values, callback) => {
      runtime.lastError = { message: 'Synthetic quota error' };
      callback();
      delete runtime.lastError;
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


describe('complete Chrome wallet removal', () => {
  it('waits for one removal acknowledgement for the complete wallet', async () => {
    let acknowledge!: () => void;
    (chrome.storage.local.remove as Mock).mockImplementation((_keys, done) => { acknowledge = done!; });
    const keys = ['fw:keyring', 'fw:account:fixture', 'fw:ton:fixture'];
    let completed = false;
    const removing = removeWalletRecords(keys).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledExactlyOnceWith(keys, expect.any(Function));
    acknowledge();
    await removing;
    expect(completed).toBe(true);
  });

  it('rejects storage removal failure and does not pretend an empty reset succeeded', async () => {
    (chrome.storage.local.remove as Mock).mockImplementation((_keys, done) => {
      runtime.lastError = { message: 'Synthetic removal failure' };
      done!();
      delete runtime.lastError;
    });
    await expect(removeWalletRecords(['fw:keyring', 'fw:ton:fixture'])).rejects.toThrow('Cannot save wallet storage');
  });
});
