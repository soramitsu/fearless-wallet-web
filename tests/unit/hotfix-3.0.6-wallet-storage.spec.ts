/** @jest-environment node */
import { chrome } from '@extension-base/utils/crossenv';
import { readWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';

jest.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
jest.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: {},
    storage: { local: { get: jest.fn(), set: jest.fn() } },
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
