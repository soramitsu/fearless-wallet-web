import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Provider from '@walletconnect/universal-provider';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, failRead: false, failWrite: false, holdWrite: false,
  writes: [] as (() => void)[],
  runtime: { getURL: (path: string) => path, lastError: undefined as { message: string } | undefined },
}));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys, callback) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Public retirement read failure' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data, callback) => {
      const snapshot = structuredClone(data);
      const finish = () => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Public retirement write failure' } : undefined;
        if (!fixture.failWrite) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      };
      if (fixture.holdWrite) fixture.writes.push(finish); else finish();
    },
  } },
} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

const key = 'fwWalletConnect:retiredTopics';
const topic = 'public-revoked-mobile-session';
let client: { on: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; session: { values: SessionTypes.Struct[] } };
let listeners: Record<string, (event: { topic: string }) => Promise<void>>;
let pending: Promise<unknown>[];
const state = { keyringService: { getAddresses: () => [], getAllAccounts: () => [] } } as unknown as State;
const observe = (promise: Promise<unknown>) => {
  const outcome = promise.then(() => 'resolved', () => 'rejected');
  pending.push(outcome);
  return outcome;
};
const initialize = (service: WalletConnectDAppService) =>
  (service as unknown as { initApp(): Promise<void> }).initApp();
async function open() {
  const service = new WalletConnectDAppService(state);
  await initialize(service);
  return service;
}

beforeEach(() => {
  fixture.data = {};
  fixture.failRead = false;
  fixture.failWrite = false;
  fixture.holdWrite = false;
  fixture.writes = [];
  pending = [];
  listeners = {};
  // Deliberately retain the SDK session after disconnect: transport failure or a
  // stale persisted SDK record must not restore local signing authority.
  client = {
    session: { values: [{ topic }] as SessionTypes.Struct[] },
    on: vi.fn((event, callback) => { listeners[event] = callback; }),
    disconnect: vi.fn(async () => undefined),
  };
  vi.spyOn(Provider, 'init').mockResolvedValue({ client } as unknown as Provider);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  fixture.failWrite = false;
  fixture.failRead = false;
  fixture.holdWrite = false;
  for (let i = 0; i < 12; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('durable mobile session retirement', () => {
  it('keeps a disconnected SDK session retired after constructing a new worker service', async () => {
    const service = await open();
    await service.disconnect(topic);
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('persists local retirement even when the SDK disconnect rejects', async () => {
    const service = await open();
    client.disconnect.mockRejectedValue(new Error('Public relay unavailable'));
    await Promise.resolve(service.disconnect(topic)).catch(() => undefined);
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it.each(['session_delete', 'session_expire'])('retains %s invalidation across worker reconstruction', async (event) => {
    await open();
    await listeners[event]({ topic });
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('waits for storage acknowledgement before reporting disconnect completion', async () => {
    const service = await open();
    fixture.holdWrite = true;
    let done = false;
    const result = observe(Promise.resolve(service.disconnect(topic)).then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(() => service.getSession(topic)).toThrow();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('reports failed durable retirement while vetoing the running session and permits retry', async () => {
    const service = await open();
    fixture.failWrite = true;
    expect(await observe(Promise.resolve(service.disconnect(topic)))).toBe('rejected');
    expect(() => service.getSession(topic)).toThrow();
    fixture.failWrite = false;
    await service.disconnect(topic);
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('refuses initialization when retirement storage cannot be read', async () => {
    fixture.failRead = true;
    const service = new WalletConnectDAppService(state);
    expect(await observe(initialize(service))).toBe('rejected');
    expect(Provider.init).not.toHaveBeenCalled();
    expect(() => service.getSession(topic)).toThrow();
    fixture.failRead = false;
    await initialize(service);
    expect(service.getSession(topic).topic).toBe(topic);
  });

  it('refuses malformed retirement state without overwriting it', async () => {
    fixture.data[key] = { version: 1, topics: [null] };
    const original = structuredClone(fixture.data);
    const service = new WalletConnectDAppService(state);
    expect(await observe(initialize(service))).toBe('rejected');
    expect(Provider.init).not.toHaveBeenCalled();
    expect(fixture.data).toEqual(original);
  });
});
