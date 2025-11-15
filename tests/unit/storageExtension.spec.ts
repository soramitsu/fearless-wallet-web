import type { IState } from '@extension-base/background/types/types';
import { StorageExtension } from '@extension-base/stores/StorageExtension';

jest.mock('@extension-base/utils/crossenv', () => {
  const storageMock = {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn((_: string, cb?: () => void) => cb?.()),
  };

  return {
    chrome: {
      storage: {
        local: storageMock,
      },
      runtime: {
        lastError: null,
      },
    },
  };
});

const { chrome } = require('@extension-base/utils/crossenv') as {
  chrome: {
    storage: { local: { get: jest.Mock; set: jest.Mock; remove: jest.Mock } };
    runtime: { lastError: unknown };
  };
};

describe('StorageExtension', () => {
  const store = new StorageExtension();
  const keys: (keyof IState)[] = ['providers', 'injectedProviders'];

  beforeEach(() => {
    chrome.storage.local.get.mockReset();
    chrome.storage.local.remove.mockClear();
  });

  it('returns sanitized map for valid entries', async () => {
    chrome.storage.local.get.mockImplementation((_keys: unknown, cb: (result: Record<string, unknown>) => void) => {
      cb({
        providers: { foo: 'bar' },
        injectedProviders: { baz: 'qux' },
      });
    });

    const result = await store.get(keys);

    expect(result.providers).toEqual({ foo: 'bar' });
    expect(result.injectedProviders).toEqual({ baz: 'qux' });
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('removes invalid entries and returns empty fallbacks', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    chrome.storage.local.get.mockImplementation((_keys: unknown, cb: (result: Record<string, unknown>) => void) => {
      cb({
        providers: null,
        injectedProviders: undefined,
      });
    });

    const result = await store.get(keys);

    expect(result.providers).toEqual({});
    expect(result.injectedProviders).toEqual({});
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});
