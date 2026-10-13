import Extension from '@extension-base/background/handlers/Extension';
import WalletConnect from '@walletconnect/sign-client';
import { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Provider from '@walletconnect/universal-provider';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type { RequestService } from '@extension-base/services/request-service';
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
      if (!callback) return fixture.failRead ? Promise.reject(new Error('Public retirement read failure')) : Promise.resolve(structuredClone(fixture.data));
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
let client: { connect: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; session: { values: SessionTypes.Struct[]; get(topic: string): SessionTypes.Struct | undefined } };
let listeners: Record<string, (event: { topic: string }) => Promise<void>>;
let pending: Promise<unknown>[];
const state = { networkService: { networkValues: [{ name: 'Public Substrate', ecosystem: 'substrate', chainId: '11'.repeat(32) }] }, keyringService: { getAddresses: () => [], getAllAccounts: () => [] } } as unknown as State;
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
  Object.assign(state.keyringService, { isResetting: false, walletResetRevision: 0 });
  fixture.data = {};
  fixture.failRead = false;
  fixture.failWrite = false;
  fixture.holdWrite = false;
  fixture.writes = [];
  pending = [];
  delete (state as Partial<State>).walletConnectService;
  delete (state as Partial<State>).walletConnectDappService;
  listeners = {};
  // Deliberately retain the SDK session after disconnect: transport failure or a
  // stale persisted SDK record must not restore local signing authority.
  client = {
    connect: vi.fn(),
    session: { values: [{ topic }] as SessionTypes.Struct[], get: (key) => client.session.values.find((item) => item.topic === key) },
    on: vi.fn((event, callback) => { listeners[event] = callback; }),
    disconnect: vi.fn(async () => undefined),
  };
  vi.spyOn(Provider, 'init').mockResolvedValue({ client } as unknown as Provider);
  vi.spyOn(WalletConnect, 'init').mockResolvedValue(client as unknown as WalletConnect);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe.each(['mobile', 'incoming'] as const)('whole reset retirement through %s role', (role) => {
  async function services() {
    const mobile = await open();
    const incoming = await openIncoming();
    Object.assign(state, { walletConnectDappService: mobile, walletConnectService: incoming });
    return { mobile, incoming };
  }
  it('acknowledges durable retirement and keeps retained SDK sessions revoked after restart', async () => {
    const all = await services();
    fixture.holdWrite = true;
    let done = false;
    const result = observe(all[role].resetWallet().then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(() => all.mobile.getSession(topic)).toThrow();
    expect(() => all.incoming.getSession(topic)).toThrow();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(fixture.data[key]).toMatchObject({ topics: [topic] });
    const restarted = await services();
    expect(() => restarted.mobile.getSession(topic)).toThrow();
    expect(() => restarted.incoming.getSession(topic)).toThrow();
  });
  it('rejects a failed retirement and retries the raw SDK record even after local invalidation', async () => {
    const all = await services();
    fixture.failWrite = true;
    expect(await observe(all[role].resetWallet())).toBe('rejected');
    expect(() => all[role].getSession(topic)).toThrow();
    fixture.failWrite = false;
    await all[role].resetWallet();
    expect(fixture.data[key]).toMatchObject({ topics: [topic] });
  });
});

describe('incoming session approval across reset', () => {
  it('retires a session whose SDK approval completes after reset', async () => {
    const incoming = await openIncoming();
    let finish!: (result: { topic: string }) => void;
    Object.assign(client, { approve: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    const approved = observe(incoming.approveSession({ id: 1, namespaces: {} }));
    Object.assign(state.keyringService, { isResetting: true, walletResetRevision: 1 });
    await incoming.resetWallet();
    Object.assign(state.keyringService, { isResetting: false });
    const lateTopic = 'public-late-approved-topic';
    client.session.values.push({ topic: lateTopic } as SessionTypes.Struct);
    finish({ topic: lateTopic });
    expect(await approved).toBe('rejected');
    expect(() => incoming.getSession(lateTopic)).toThrow();
    const restarted = await openIncoming();
    expect(() => restarted.getSession(lateTopic)).toThrow();
  });
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


describe('pairing cancellation retirement acknowledgement', () => {
  async function pairing() {
    let approve!: (session: SessionTypes.Struct) => void;
    const approval = new Promise<SessionTypes.Struct>((resolve) => { approve = resolve; });
    client.connect.mockResolvedValue({ uri: 'wc:public-cancel-fixture', approval: () => approval });
    const service = await open();
    // A new pairing must not already be present when its prior topics are captured.
    client.session.values = [];
    await service.initPairing('public-cancel-attempt');
    client.session.values = [{ topic }] as SessionTypes.Struct[];
    return { service, approve: async () => {
      approve(client.session.values[0]);
      for (let i = 0; i < 12; i++) await Promise.resolve();
    } };
  }

  it('does not acknowledge cancellation of an approved session until retirement is durable', async () => {
    const { service, approve } = await pairing();
    await approve();
    fixture.holdWrite = true;
    let done = false;
    const result = observe(service.abortPairingAttempt('public-cancel-attempt').then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(() => service.getSession(topic)).toThrow();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(() => (service.getSession(topic))).toThrow();
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('rejects failed cancellation storage and keeps the owned attempt available for retry', async () => {
    const { service, approve } = await pairing();
    await approve();
    fixture.failWrite = true;
    expect(await observe(service.abortPairingAttempt('public-cancel-attempt'))).toBe('rejected');
    expect(() => service.getSession(topic)).toThrow();
    fixture.failWrite = false;
    expect(await service.abortPairingAttempt('public-cancel-attempt')).toBe(true);
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('persists retirement when approval arrives after cancellation', async () => {
    const { service, approve } = await pairing();
    await service.abortPairingAttempt('public-cancel-attempt');
    await approve();
    await vi.waitFor(() => expect(fixture.data[key]).toMatchObject({ topics: [topic] }));
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });
});

async function openIncoming() {
  const service = new WalletConnectService(state, {} as RequestService);
  await service.initClient(true);
  return service;
}
describe('durable incoming session retirement', () => {
  it('keeps a disconnected SDK session retired after constructing a new worker service', async () => {
    const service = await openIncoming();
    await service.disconnect(topic);
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('persists local retirement even when the SDK disconnect rejects', async () => {
    const service = await openIncoming();
    client.disconnect.mockRejectedValue(new Error('Public relay unavailable'));
    await Promise.resolve(service.disconnect(topic)).catch(() => undefined);
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it.each(['session_delete', 'session_expire'])('retains %s invalidation across worker reconstruction', async (event) => {
    await openIncoming();
    await listeners[event]({ topic });
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('waits for storage acknowledgement before reporting disconnect completion', async () => {
    const service = await openIncoming();
    fixture.holdWrite = true;
    let done = false;
    const result = observe(Promise.resolve(service.disconnect(topic)).then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(() => service.getSession(topic)).toThrow();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('reports failed durable retirement while vetoing the running session and permits retry', async () => {
    const service = await openIncoming();
    fixture.failWrite = true;
    expect(await observe(Promise.resolve(service.disconnect(topic)))).toBe('rejected');
    expect(() => service.getSession(topic)).toThrow();
    fixture.failWrite = false;
    await service.disconnect(topic);
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('refuses initialization when retirement storage cannot be read', async () => {
    fixture.failRead = true;
    const service = new WalletConnectService(state, {} as RequestService);
    expect(await observe(service.initClient(true))).toBe('rejected');
    expect(WalletConnect.init).not.toHaveBeenCalled();
    expect(() => service.getSession(topic)).toThrow();
    fixture.failRead = false;
    await service.initClient(true);
    expect(service.getSession(topic).topic).toBe(topic);
  });

  it('refuses malformed retirement state without overwriting it', async () => {
    fixture.data[key] = { version: 1, topics: [null] };
    const original = structuredClone(fixture.data);
    const service = new WalletConnectService(state, {} as RequestService);
    expect(await observe(service.initClient(true))).toBe('rejected');
    expect(WalletConnect.init).not.toHaveBeenCalled();
    expect(fixture.data).toEqual(original);
  });
});


describe('session retirement across roles and removal', () => {
  it.each(['mobile', 'incoming'])('immediately vetoes the other live role when %s disconnects', async (role) => {
    const mobile = await open();
    const incoming = await openIncoming();
    Object.assign(state, { walletConnectDappService: mobile, walletConnectService: incoming });
    fixture.holdWrite = true;
    const pending = observe((role === 'mobile' ? mobile : incoming).disconnect(topic));
    expect(() => mobile.getSession(topic)).toThrow();
    expect(() => incoming.getSession(topic)).toThrow();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writes.shift()!();
    expect(await pending).toBe('resolved');
  });

  it('merges concurrent retirements and preserves unrelated record fields', async () => {
    fixture.data[key] = { version: 1, topics: ['old-public-topic'], futureMetadata: { retained: true } };
    const mobile = await open();
    const incoming = await openIncoming();
    await Promise.all([mobile.disconnect(topic), incoming.disconnect('other-public-topic')]);
    expect(fixture.data[key]).toEqual({ version: 1, topics: ['old-public-topic', topic, 'other-public-topic'], futureMetadata: { retained: true } });
  });

  it('retires later accounts in scoped namespaces and retries failed removal storage', async () => {
    const owned = '0x' + '11'.repeat(20);
    client.session.values[0].namespaces = { 'eip155:1': {
      accounts: [`eip155:1:0x${'22'.repeat(20)}`, `eip155:1:${owned}`], methods: ['personal_sign'], events: [],
    } };
    const incoming = await openIncoming();
    fixture.failWrite = true;
    expect(await observe(incoming.removeSessions('0x' + '33'.repeat(32), owned))).toBe('rejected');
    expect(() => incoming.getSession(topic)).toThrow();
    fixture.failWrite = false;
    await incoming.removeSessions('0x' + '33'.repeat(32), owned);
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('does not remove a mobile address before its session retirement is acknowledged', async () => {
    const mobile = await open();
    const forgetAddress = vi.fn();
    const removalState = {
      keyringService: { getPair: () => undefined, getAddress: () => ({ meta: { wcTopic: topic } }), forgetAddress },
      requestService: { mutateAuthorizations: async (update) => update({}) },
      walletConnectDappService: mobile,
      cleanupDeletedAccount: vi.fn(),
    } as unknown as State;
    const extension = new Extension(removalState);
    fixture.holdWrite = true;
    const result = observe(extension.accountsForget({ address: 'public-mobile-address', type: 'mobile' }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(forgetAddress).not.toHaveBeenCalled();
    fixture.failWrite = true;
    fixture.writes.shift()!();
    expect(await result).toBe('rejected');
    expect(forgetAddress).not.toHaveBeenCalled();
    expect(removalState.cleanupDeletedAccount).not.toHaveBeenCalled();
    fixture.holdWrite = false;
    fixture.failWrite = false;
    expect(await extension.accountsForget({ address: 'public-mobile-address', type: 'mobile' })).toBe(true);
    expect(forgetAddress).toHaveBeenCalledExactlyOnceWith('public-mobile-address', expect.any(Function), expect.any(Function));
    const restarted = await open();
    expect(() => restarted.getSession(topic)).toThrow();
  });
});


describe('standalone EVM removal retirement', () => {
  const owned = '0x' + '44'.repeat(20);
  async function incomingForStandalone() {
    client.session.values[0].namespaces = { eip155: {
      accounts: [`eip155:1:${owned}`], methods: ['personal_sign'], events: [],
    } };
    return openIncoming();
  }

  it('matches a standalone primary EVM address without linked-account metadata', async () => {
    const incoming = await incomingForStandalone();
    await incoming.removeSessions(owned);
    expect(fixture.data[key]).toMatchObject({ topics: [topic] });
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });

  it('persists session retirement through actual native account removal for a standalone EVM pair', async () => {
    const incoming = await incomingForStandalone();
    const forgetAccount = vi.fn();
    const removalState = {
      keyringService: { archiveWallet: vi.fn(async () => undefined), getPair: () => ({ address: owned, meta: {} }), forgetAccount },
      requestService: { mutateAuthorizations: async (update) => update({}) },
      walletConnectService: incoming,
      cleanupDeletedAccount: vi.fn(),
    } as unknown as State;
    const extension = new Extension(removalState);
    expect(await extension.accountsForget({ address: owned, type: 'native' })).toBe(true);
    expect(forgetAccount).toHaveBeenCalledExactlyOnceWith(owned, expect.any(Function), expect.any(Function));
    expect(fixture.data[key]).toMatchObject({ topics: [topic] });
    const restarted = await openIncoming();
    expect(() => restarted.getSession(topic)).toThrow();
  });
});
