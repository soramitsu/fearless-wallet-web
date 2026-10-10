import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Port } from '@extension-base/background/types/types';

type Reply = 'answer' | 'fail' | 'hold';
type StoredRecords = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  chrome: {
    runtime: { lastError: undefined as undefined | { message: string }, reload: () => {} },
    storage: { local: { get: (() => {}) as (...args: unknown[]) => void, set: (() => {}) as (...args: unknown[]) => void, remove: (() => {}) as (...args: unknown[]) => void } },
    tabs: { query: () => {} },
  },
  keyring: undefined as unknown,
  state: undefined as unknown,
  handlers: undefined as unknown,
  migrate: undefined as unknown,
}));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: mocks.chrome }));
vi.mock('@polkadot/util-crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@polkadot/util-crypto')>()),
  cryptoWaitReady: () => Promise.resolve(true),
}));
// Mocked modules outlive vi.resetModules(), so they delegate to the current test's fakes.
const current = <T extends object>(read: () => unknown) => new Proxy({}, { get: (_, key) => (read() as T)[key as keyof T] });
vi.mock('@subwallet/ui-keyring', () => ({ keyring: current(() => mocks.keyring) }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/background/handlers', () => ({
  handlers: (...args: unknown[]) => (mocks.handlers as (...args: unknown[]) => unknown)(...args),
  state: current(() => mocks.state),
}));
vi.mock('@extension-base/services/migration-service', () => ({
  default: { start: () => (mocks.migrate as () => void)() },
}));
vi.mock('@extension-base/stores/Storage', () => ({ initStorage: () => Promise.resolve() }));

const TON_ADDRESS = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';
// A 3.0.5 profile: master password, one Substrate account, one TON account selected as current.
const PROFILE: StoredRecords = {
  'fw:keyring': { passwordHash: `0x${'ab'.repeat(32)}` },
  'fw:account:0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d': {
    address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    encoded: 'synthetic-ciphertext',
    meta: { isMasterPassword: true, name: 'Polkadot', walletEcosystem: 'substrate' },
  },
  [`fw:ton:${TON_ADDRESS}`]: {
    name: 'TON wallet',
    address: TON_ADDRESS,
    cipherSeed: 'synthetic-cipher-seed',
    publicKeyHex: '11'.repeat(32),
  },
  'fwcurrent_account:CurrentAccountInfo': {
    address: TON_ADDRESS,
    name: 'TON wallet',
    ethereumAddress: '',
    isMobile: false,
    walletEcosystem: 'ton',
  },
};

// Mirrors @subwallet/ui-keyring 0.1.14 where start-up uses it: loadAll() starts a fresh
// keyring, reads `store.all` and then initialises the keyring options, which throws on every
// call after the first; the master-password hash is applied with setupMasterPassword().
function uiKeyring() {
  const accounts = new Map<string, { address: string; meta: object }>();
  let passwordHash: string | undefined;
  let optionsInitialised = false;
  let loadAllCalls = 0;
  let accountLoads = 0;
  return {
    get loadAllCalls() { return loadAllCalls; },
    get accountLoads() { return accountLoads; },
    loadAll(options: { store: { all: (update: (key: string, json: never) => void) => void } }) {
      loadAllCalls += 1;
      accounts.clear();
      passwordHash = undefined;
      options.store.all((key, json: { address: string; meta: object }) => {
        if (!key.startsWith('account:')) return;
        accountLoads += 1;
        accounts.set(key, json);
      });
      if (optionsInitialised) throw new Error('Unable to initialise options more than once');
      optionsInitialised = true;
    },
    getAccounts: () => [...accounts.values()],
    getAddresses: () => [],
    keyring: {
      get hasMasterPassword() { return !!passwordHash; },
      isLocked: true,
      setupMasterPassword: (hash: string) => { passwordHash = hash; },
    },
  };
}

let reply: (keys: string[] | null, call: number) => Reply;
let held: (() => void)[];
let reads: (string[] | null)[];

function installStorage(records: StoredRecords) {
  reads = [];
  held = [];
  reply = () => 'answer';
  const local = mocks.chrome.storage.local;
  local.set = vi.fn();
  local.remove = vi.fn();
  local.get = vi.fn((keys: string[] | null, done: (result?: StoredRecords) => void) => {
    reads.push(keys);
    const decision = reply(keys, reads.length);
    const respond = () => {
      if (decision === 'fail') {
        mocks.chrome.runtime.lastError = { message: 'IO error: LOCK file in use' };
        done(undefined);
        mocks.chrome.runtime.lastError = undefined;
        return;
      }
      done(keys ? Object.fromEntries(keys.filter((key) => key in records).map((key) => [key, records[key]])) : { ...records });
    };
    if (decision === 'hold') held.push(respond);
    else setImmediate(respond);
  });
}

const passwordReads = () => reads.filter((keys) => keys?.[0] === 'fw:keyring').length;
const loadAllCalls = () => (mocks.keyring as { loadAllCalls: number }).loadAllCalls;
// How often a stored account record was handed to the keyring.
const accountLoads = () => (mocks.keyring as { accountLoads: number }).accountLoads;
const flush = async (turns = 12) => {
  for (let turn = 0; turn < turns; turn++) await new Promise((resolve) => setImmediate(resolve));
};

function event() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return { addListener: (listener: (...args: unknown[]) => void) => listeners.push(listener), emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)) };
}

// Builds the state the way the background does, then loads the real runtime and wake listeners.
async function startBackground() {
  vi.resetModules();
  mocks.keyring = uiKeyring();
  mocks.handlers = vi.fn();
  mocks.migrate = vi.fn();
  const { EventService } = await import('@extension-base/services/event-service');
  const { KeyringService } = await import('@extension-base/services/keyring-service');
  const eventService = new EventService();
  const emit = vi.spyOn(eventService, 'emit');
  const keyringService = new KeyringService(eventService);
  const state = {
    eventService,
    keyringService,
    onboardingService: { updateStorage: vi.fn(() => Promise.resolve()), init: vi.fn() },
    onInstall: vi.fn(),
    ensureCurrentAccount: vi.fn(),
    isReady: () => false,
  };
  mocks.state = state;
  const answered: Record<string, unknown>[] = [];
  const seen: Record<string, unknown>[] = [];
  (mocks.handlers as ReturnType<typeof vi.fn>).mockImplementation(({ id }: { id: string }) => {
    seen.push({
      id,
      hasMasterPassword: keyringService.hasMasterPassword,
      keyringIsLocked: keyringService.keyringIsLocked,
      hasAccounts: keyringService.hasAccounts,
      currentAccount: keyringService.currentAccountSubject.value?.address,
    });
    return Promise.resolve();
  });
  const { backgroundReady } = await import('@/extension/entry/backgroundRuntime');
  const { registerBackgroundListeners, WALLET_STORAGE_UNAVAILABLE } = await import('@/extension/entry/backgroundBootstrap');
  const api = {
    runtime: { onConnect: event(), onInstalled: event(), onUpdateAvailable: event(), reload: vi.fn() },
    tabs: { onUpdated: event(), onActivated: event(), onRemoved: event() },
    windows: { onFocusChanged: event() },
    alarms: { create: vi.fn(), onAlarm: event() },
  };
  registerBackgroundListeners(api as unknown as typeof chrome, backgroundReady);
  const send = (id: string, message = 'pri(keyring.hasMasterPassword)') => {
    const port = { onMessage: event(), onDisconnect: event(), postMessage: vi.fn((data) => answered.push(data)) };
    api.runtime.onConnect.emit(port as unknown as Port);
    port.onMessage.emit({ id, message, request: null });
  };
  const cryptoReadyEvents = () => emit.mock.calls.filter(([type]) => type === 'crypto.ready').length;
  return { api, state, send, seen, answered, cryptoReadyEvents, WALLET_STORAGE_UNAVAILABLE };
}

// Transform the keyring service once; each test then re-evaluates it from the cache.
beforeAll(() => import('@extension-base/services/keyring-service'), 60000);
beforeEach(() => installStorage(PROFILE));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('background start-up ordering (W10)', () => {
  it.each([
    ['the master-password record', 'the TON accounts', 1],
    ['the TON accounts', 'the master-password record', 0],
  ])('answers the first request only after %s and then %s are in memory', async (_, __, releasedFirst) => {
    // The TON service reads first, when it is created; the password record is read during start-up.
    reply = (keys, call) => (call === 1 || keys?.[0] === 'fw:keyring' ? 'hold' : 'answer');
    const background = await startBackground();
    background.send('first');
    await flush();
    expect(held).toHaveLength(2);
    expect(background.seen).toEqual([]);

    held.splice(releasedFirst, 1)[0]();
    await flush();
    expect(background.seen).toEqual([]);

    held.splice(0, 1)[0]();
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));
    expect(background.seen[0]).toEqual({
      id: 'first',
      hasMasterPassword: true,
      keyringIsLocked: true,
      hasAccounts: true,
      currentAccount: TON_ADDRESS,
    });
    expect(background.cryptoReadyEvents()).toBe(1);
    // A missing or removed selection is repaired before the first request is handled.
    const ensure = background.state.ensureCurrentAccount;
    expect(ensure).toHaveBeenCalledOnce();
    expect(ensure.mock.invocationCallOrder[0]).toBeLessThan((mocks.handlers as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it('selects a default account on update only after the stored selection has been read', async () => {
    const reload = vi.spyOn(mocks.chrome.runtime, 'reload');
    reply = (keys) => (keys?.[0] === 'fwcurrent_account:CurrentAccountInfo' ? 'hold' : 'answer');
    const background = await startBackground();
    const selectionSeen: unknown[] = [];
    background.state.onInstall.mockImplementation(() => {
      selectionSeen.push(background.state.keyringService.currentAccountSubject.value?.address);
    });
    background.api.runtime.onInstalled.emit({ reason: 'update', previousVersion: '3.0.5' });
    await flush();
    expect(held).toHaveLength(1);
    expect(background.state.onInstall).not.toHaveBeenCalled();

    held.splice(0, 1)[0]();
    await vi.waitFor(() => expect(background.state.onInstall).toHaveBeenCalledOnce());
    expect(selectionSeen).toEqual([TON_ADDRESS]);
    expect(background.state.onboardingService.updateStorage).toHaveBeenCalledExactlyOnceWith('regular', true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reports a TON-only wallet as having accounts on the very first request', async () => {
    installStorage(Object.fromEntries(Object.entries(PROFILE).filter(([key]) => !key.startsWith('fw:account:'))));
    const background = await startBackground();
    background.send('first');
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));
    expect(background.seen[0]).toMatchObject({ hasAccounts: true, hasMasterPassword: true, currentAccount: TON_ADDRESS });
  });
});

describe('background start-up when storage cannot be read (D-9)', () => {
  it('answers with a retryable storage error, changes nothing, and reads again on the next request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.spyOn(mocks.chrome.runtime, 'reload');
    reply = (keys) => (keys === null ? 'fail' : 'answer');
    const background = await startBackground();
    background.send('before-failure');
    background.api.runtime.onInstalled.emit({ reason: 'update', previousVersion: '3.0.5' });

    await vi.waitFor(() => expect(background.answered).toHaveLength(1), { timeout: 5000 });
    expect(background.answered[0]).toEqual({ id: 'before-failure', error: background.WALLET_STORAGE_UNAVAILABLE });
    // Three bounded reads of the account records after the TON service's own read.
    expect(reads.filter((keys) => keys === null)).toHaveLength(4);
    expect(background.seen).toEqual([]);
    expect(background.state.onInstall).not.toHaveBeenCalled();
    expect(background.state.onboardingService.updateStorage).not.toHaveBeenCalled();
    expect(mocks.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(mocks.chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(background.state.ensureCurrentAccount).not.toHaveBeenCalled();
    expect(background.cryptoReadyEvents()).toBe(0);

    // The popup's "Try again" reopens it, and its first request reads storage again.
    reply = () => 'answer';
    background.send('after-retry');
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));
    expect(background.seen[0]).toEqual({
      id: 'after-retry',
      hasMasterPassword: true,
      keyringIsLocked: true,
      hasAccounts: true,
      currentAccount: TON_ADDRESS,
    });
    expect(mocks.migrate).toHaveBeenCalledOnce();
    expect(background.state.ensureCurrentAccount).toHaveBeenCalledOnce();
    expect(background.cryptoReadyEvents()).toBe(1);
    // ui-keyring itself was set up once; the retries read through the same store.
    expect(loadAllCalls()).toBe(1);
    expect(accountLoads()).toBe(1);
    // The update notice Chrome sent once is handled after that read, keeping the stored
    // selection, and the extension is not reloaded under the window that retried.
    await vi.waitFor(() => expect(background.state.onInstall).toHaveBeenCalledOnce());
    expect(background.state.keyringService.currentAccountSubject.value?.address).toBe(TON_ADDRESS);
    expect(background.state.onboardingService.updateStorage).toHaveBeenCalledExactlyOnceWith('regular', true);
    expect(background.state.onboardingService.init).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries a failed master-password read instead of treating it as no password', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reply = (keys) => (keys?.[0] === 'fw:keyring' && passwordReads() === 1 ? 'fail' : 'answer');
    const background = await startBackground();
    background.send('first');
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));
    expect(background.seen[0]).toMatchObject({ hasMasterPassword: true, keyringIsLocked: true, hasAccounts: true });
    expect(passwordReads()).toBe(2);
    expect(background.answered).toEqual([]);
    // Only the password was read again; the accounts were loaded once.
    expect(accountLoads()).toBe(1);
    expect(loadAllCalls()).toBe(1);
  });

  it('retries only the failed TON read, keeping the accounts and password already read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The TON service's own read, made when it is created, fails once.
    reply = (keys, call) => (call === 1 ? 'fail' : 'answer');
    const background = await startBackground();
    background.send('first');
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));
    expect(background.seen[0]).toEqual({
      id: 'first',
      hasMasterPassword: true,
      keyringIsLocked: true,
      hasAccounts: true,
      currentAccount: TON_ADDRESS,
    });
    expect(background.answered).toEqual([]);
    // Only the TON accounts were read again.
    expect(accountLoads()).toBe(1);
    expect(passwordReads()).toBe(1);
    expect(loadAllCalls()).toBe(1);
    expect(background.cryptoReadyEvents()).toBe(1);
  });

  it('answers within the deadline when a read never answers, then serves requests once it does', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    reply = (keys) => (keys?.[0] === 'fw:keyring' ? 'hold' : 'answer');
    const background = await startBackground();
    background.send('waiting');
    await flush();
    await vi.advanceTimersByTimeAsync(14999);
    expect(background.answered).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(background.answered).toEqual([{ id: 'waiting', error: background.WALLET_STORAGE_UNAVAILABLE }]);
    expect(background.seen).toEqual([]);

    // The same read is still awaited; no second read competes with it.
    held.splice(0, 1)[0]();
    await flush();
    background.send('later');
    await flush();
    expect(background.seen).toEqual([{
      id: 'later',
      hasMasterPassword: true,
      keyringIsLocked: true,
      hasAccounts: true,
      currentAccount: TON_ADDRESS,
    }]);
    expect(passwordReads()).toBe(1);
    expect(background.cryptoReadyEvents()).toBe(1);
  });
});
