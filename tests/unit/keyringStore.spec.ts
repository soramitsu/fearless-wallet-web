import KeyringStore from '@extension-base/stores/KeyringStore';

describe('KeyringStore (extension)', () => {
  let store: KeyringStore;
  let chromeGet: jest.Mock;
  let chromeRemove: jest.Mock;

  beforeEach(() => {
    chromeGet = jest.fn();
    chromeRemove = jest.fn((key: string, cb?: () => void) => {
      cb?.();
    });

    (global as typeof globalThis & { chrome: any }).chrome = {
      storage: {
        local: {
          get: chromeGet,
          remove: chromeRemove,
          set: jest.fn((value: unknown, cb?: () => void) => cb?.()),
        },
      },
      runtime: {
        lastError: null,
      },
    };

    store = new KeyringStore();
  });

  afterEach(() => {
    // @ts-expect-error cleanup test shim
    delete global.chrome;
  });

  it('passes through valid keyring payloads', () => {
    const payload = { address: '5Dw', meta: { name: 'alice' } } as unknown;

    chromeGet.mockImplementation((keys: string[], cb: (result: Record<string, unknown>) => void) => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      cb({ [key]: payload });
    });

    const update = jest.fn();

    store.get(update);

    expect(update).toHaveBeenCalledWith(payload);
    expect(chromeRemove).not.toHaveBeenCalled();
  });

  it('clears and falls back when keyring payload is malformed', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    chromeGet.mockImplementation((keys: string[], cb: (result: Record<string, unknown>) => void) => {
      const key = Array.isArray(keys) ? keys[0] : keys;
      cb({ [key]: 'corrupted' });
    });

    const update = jest.fn();

    store.get(update);

    expect(update).toHaveBeenCalledWith({} as unknown);
    expect(chromeRemove).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
