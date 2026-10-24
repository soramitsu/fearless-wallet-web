import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUrls } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services/request-service';
import type State from '@extension-base/background/handlers/State';

const fixture = vi.hoisted(() => ({
  extension: true,
  readError: false,
  writeError: false,
  data: {} as Record<string, AuthUrls>,
  writes: [] as Array<() => void>,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@/consts/global', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  get IS_EXTENSION() { return fixture.extension; },
}));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: fixture.runtime,
    storage: {
      local: {
        get: (_keys: unknown, callback: (data: Record<string, AuthUrls>) => void) => {
          fixture.runtime.lastError = fixture.readError ? { message: 'Public read unavailable' } : undefined;
          callback(structuredClone(fixture.data));
          fixture.runtime.lastError = undefined;
        },
        set: (data: Record<string, AuthUrls>, callback: () => void) => {
          fixture.writes.push(() => {
            fixture.runtime.lastError = fixture.writeError ? { message: 'Public quota exceeded' } : undefined;
            if (!fixture.writeError) Object.assign(fixture.data, structuredClone(data));
            callback();
            fixture.runtime.lastError = undefined;
          });
        },
      },
    },
  },
}));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
const origin = 'https://storage.public.example';
const grant = {
  id: 'public-grant',
  origin,
  url: origin,
  isAllowed: true,
  count: 0,
  authorizedAccounts: ['public-root'],
  evmAuthorizedAccount: '',
  allowedAccountsMap: {},
};
const key = 'fwauthorize:authUrls';
const requests = { updateIcon: vi.fn(), popupOpen: vi.fn() } as unknown as RequestService;
const state = {
  networkService: {},
  keyringService: { encodeAddress: (address: string) => address },
} as unknown as State;
const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    () => 'resolved',
    () => 'rejected'
  );

describe.each([true, false])('real authorization store (extension: %s)', (extension) => {
  let create: () => import('@extension-base/services/request-service/handlers/AuthRequestHandler').AuthRequestHandler;
  let flush: () => Promise<void>;
  beforeEach(async () => {
    vi.resetModules();
    fixture.extension = extension;
    fixture.data = {};
    fixture.writes = [];
    fixture.readError = false;
    fixture.writeError = false;
    const { default: BaseWebStore } = await import('@extension-base/stores/BaseWeb');
    const { default: BaseExtensionStore } = await import('@extension-base/stores/BaseExtension');
    flush = () => (extension ? BaseExtensionStore : BaseWebStore).flush();
    vi.spyOn(BaseWebStore.prototype, 'openDatabase').mockResolvedValue({
      transaction: () => {
        const transaction = {
          oncomplete: undefined as (() => void) | undefined,
          onabort: undefined as (() => void) | undefined,
          error: undefined as Error | undefined,
          objectStore: () => ({
            get: (key: string) => {
              const read = {
                onsuccess: undefined as (() => void) | undefined,
                result: structuredClone(fixture.data[key]),
              };
              queueMicrotask(() => {
                if (fixture.readError) {
                  transaction.error = new Error('Public read unavailable');
                  transaction.onabort?.();
                } else read.onsuccess?.();
              });
              return read;
            },
            put: (value: AuthUrls, key: string) => {
              const snapshot = structuredClone(value);
              fixture.writes.push(() => {
                if (fixture.writeError) {
                  transaction.error = new Error('Public disk failure');
                  transaction.onabort?.();
                } else {
                  fixture.data[key] = snapshot;
                  transaction.oncomplete?.();
                }
              });
            },
          }),
        };
        return transaction;
      },
    } as unknown as IDBDatabase);
    const { AuthRequestHandler } = await import('@extension-base/services/request-service/handlers/AuthRequestHandler');
    const { default: AuthorizeStore } = await import('@extension-base/stores/Authorize');
    expect(new AuthorizeStore()).toBeInstanceOf(extension ? BaseExtensionStore : BaseWebStore);
    create = () => new AuthRequestHandler(requests, state);
  });
  afterEach(async () => {
    await flush().catch(() => undefined);
    vi.restoreAllMocks();
  });

  it('waits for physical acknowledgement and recovers only the committed grant after restart', async () => {
    let auth = create();
    await auth.getAuthList();
    let finished = false;
    const write = auth
      .mutateAuthorizations((entries) => {
        entries[origin] = grant;
      })
      .then(() => {
        finished = true;
      });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(finished).toBe(false);
    expect(() => auth.getSigningAuthorizationRevision(origin, 'substrate', 'public-root')).toThrow();
    fixture.writes[0]();
    await write;
    expect(fixture.data[key][origin]).toEqual(grant);
    auth = create();
    await auth.getAuthList();
    expect(auth.getSigningAuthorizationRevision(origin, 'substrate', 'public-root')).toBeTypeOf('number');
  });
  it('propagates quota/transaction abort and permits an explicit retry', async () => {
    const auth = create();
    await auth.getAuthList();
    const write = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[origin] = grant;
      })
    );
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writeError = true;
    fixture.writes[0]();
    expect(await write).toBe('rejected');
    expect(fixture.data[key]).toBeUndefined();
    expect(() => auth.getSigningAuthorizationRevision(origin, 'substrate', 'public-root')).toThrow();
    fixture.writeError = false;
    const retry = auth.mutateAuthorizations((entries) => {
      entries[origin] = grant;
    });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(2));
    fixture.writes[1]();
    await retry;
    expect(fixture.data[key][origin]).toEqual(grant);
  });
  it('rejects a failed initial read without replacing the existing record and retries', async () => {
    fixture.data[key] = { [origin]: grant };
    fixture.readError = true;
    const auth = create();
    await expect(auth.getAuthList()).rejects.toThrow('Public read unavailable');
    expect(fixture.writes).toHaveLength(0);
    expect(() => auth.getSigningAuthorizationRevision(origin, 'substrate', 'public-root')).toThrow();
    fixture.readError = false;
    await auth.getAuthList();
    expect(auth.getSigningAuthorizationRevision(origin, 'substrate', 'public-root')).toBeTypeOf('number');
  });
});
