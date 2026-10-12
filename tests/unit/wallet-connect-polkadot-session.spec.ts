import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import WalletConnect from '@walletconnect/sign-client';
import { checkIfDenied } from '@polkadot/phishing';
import { WalletConnectService as LiveWalletConnectService } from '@extension-base/services/wallet-connect-service';
import { cryptoWaitReady, decodeAddress, encodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import Extension from '@extension-base/background/handlers/Extension';
import { PolkadotHandler } from '@extension-base/services/wallet-connect-service/requestHandlers/PolkadotHandler';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public unfunded development keys; no WalletConnect relay or live chain calls.
const url = 'https://public-walletconnect.example';
const topic = 'public-polkadot-session';
const genesis = `0x${'11'.repeat(32)}`;
const chainId = `polkadot:${'11'.repeat(16)}`;
let alice: ReturnType<Keyring['addFromUri']>;
let state: State, service: RequestService, wc: WalletConnectService;
let extension: Extension, handler: PolkadotHandler, substrate: SubstrateRequestHandler;
let sessions: Record<string, SessionTypes.Struct>, revisions: Record<string, number>;
let respond: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(() => {
  vi.mocked(checkIfDenied).mockResolvedValue(false);
  alice = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  const record = {
    address: alice.address,
    publicKey: decodeAddress(alice.address),
    meta: { name: 'Public signing account' },
  };
  sessions = {
    [topic]: {
      topic,
      acknowledged: true,
      expiry: 2000000000,
      peer: { publicKey: 'public-peer', metadata: { name: 'Public peer', url, icons: [], description: '' } },
      namespaces: {
        polkadot: {
          accounts: [`${chainId}:${alice.address}`],
          methods: ['polkadot_signMessage', 'polkadot_signTransaction'],
          events: [],
        },
      },
      requiredNamespaces: {
        polkadot: { chains: [chainId], methods: ['polkadot_signMessage', 'polkadot_signTransaction'], events: [] },
      },
      optionalNamespaces: {},
    } as unknown as SessionTypes.Struct,
  };
  revisions = {};
  respond = vi.fn(async () => undefined);
  wc = {
    getSession: (key: string) => sessions[key],
    getSessionRevision: (key: string) => revisions[key] ?? 0,
    isRequestExpired: () => false,
    responseRequest: respond,
  } as unknown as WalletConnectService;
  service = {
    knownMetadata: [],
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
  } as unknown as RequestService;
  state = {
    requestService: service,
    walletConnectService: wc,
    networkService: { networkMap: {} },
    keyringService: {
      getAllAccounts: () => [record],
      getAddresses: () => [],
      getAddress: () => record,
      getPair: vi.fn(() => alice),
      encodeAddress,
      unlockPair: vi.fn(),
    },
  } as unknown as State;
  substrate = new SubstrateRequestHandler(service, state);
  Object.assign(service, {
    substrateRequestHandler: substrate,
    sign: substrate.sign.bind(substrate),
    signWalletConnect: substrate.signWalletConnect.bind(substrate),
    getSignRequest: (id: string) => substrate.getSignRequest(id),
  });
  handler = new PolkadotHandler(state, wc);
  extension = new Extension(state);
});
function event(options: { topic?: string; id?: number; extrinsic?: boolean; address?: string } = {}) {
  const address = options.address ?? alice.address;
  return {
    topic: options.topic ?? topic,
    id: options.id ?? 1,
    params: {
      chainId,
      request: {
        method: options.extrinsic ? 'polkadot_signTransaction' : 'polkadot_signMessage',
        params: options.extrinsic
          ? {
              address,
              transactionPayload: {
                address,
                genesisHash: genesis,
                blockHash: genesis,
                blockNumber: '0x00',
                era: '0x00',
                method: '0x1234',
                nonce: '0x02',
                specVersion: '0x01',
                transactionVersion: '0x01',
                tip: '0x00',
                signedExtensions: ['CheckNonce'],
                version: 4,
              },
            }
          : { address, message: '0x68656c6c6f' },
      },
    },
  } as unknown as SignClientTypes.EventArguments['session_request'];
}
async function dispatch(request = event()) {
  try {
    handler.handleRequest(request);
  } catch {
    /* The service dispatch owns synchronous admission failures. */
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
const pending = () => substrate.allSubstrateRequests;
async function approveOnly() {
  expect(pending()).toHaveLength(1);
  return extension.signingApprove({ id: pending()[0].id });
}

describe('incoming WalletConnect Polkadot session authorization', () => {
  it('uses the approved session without borrowing an ordinary website grant', async () => {
    vi.mocked(service.ensureAccountAuthorized).mockRejectedValue(new Error('No ordinary site permission'));
    await dispatch();
    expect(await approveOnly()).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    const response = respond.mock.calls[0][0];
    expect(response.topic).toBe(topic);
    expect(response.response.id).toBe(1);
    expect(signatureVerify(wrapBytes('0x68656c6c6f'), response.response.result.signature, alice.address).isValid).toBe(
      true
    );
    expect(service.ensureAccountAuthorized).not.toHaveBeenCalled();
    expect(service.authRequestHandler.assertSigningAuthorization).not.toHaveBeenCalled();
  });
  it.each(['method', 'chain', 'expired', 'unacknowledged', 'wrong topic', 'missing peer', 'proposal-only'])(
    'refuses %s approval at admission',
    async (kind) => {
      const session = sessions[topic];
      if (kind === 'method') session.namespaces.polkadot.methods = [];
      if (kind === 'chain') session.namespaces.polkadot.accounts = [`polkadot:${'22'.repeat(16)}:${alice.address}`];
      if (kind === 'expired') session.expiry = 1;
      if (kind === 'unacknowledged') session.acknowledged = false;
      if (kind === 'wrong topic') session.topic = 'other';
      if (kind === 'missing peer') session.peer.publicKey = '';
      if (kind === 'proposal-only') session.namespaces = {};
      await dispatch();
      expect(pending()).toHaveLength(0);
    }
  );
  it.each(['method', 'account', 'chain', 'expiry', 'peer', 'origin', 'revision', 'revoke/restore'])(
    'refuses %s change after review before key access',
    async (kind) => {
      await dispatch();
      expect(pending()).toHaveLength(1);
      vi.mocked(state.keyringService.getPair).mockClear();
      const session = sessions[topic];
      if (kind === 'method') session.namespaces.polkadot.methods = [];
      if (kind === 'account') session.namespaces.polkadot.accounts = [];
      if (kind === 'chain') session.namespaces.polkadot.chains = [`polkadot:${'22'.repeat(16)}`];
      if (kind === 'expiry') session.expiry = 1;
      if (kind === 'peer') session.peer.publicKey = 'other-peer';
      if (kind === 'origin') session.peer.metadata.url = 'https://different.example';
      if (kind === 'revision' || kind === 'revoke/restore') revisions[topic] = 1;
      expect(await approveOnly()).toBe(false);
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
      expect(respond.mock.calls[0][0].response.error).toBeDefined();
      expect(pending()).toHaveLength(0);
    }
  );
  it('checks session again after an asynchronous signature finishes', async () => {
    await dispatch();
    const id = pending()[0].id;
    const queued = substrate.getSignRequest(id)!;
    const original = queued.request.sign.bind(queued.request);
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => {
      release = resolve;
    });
    queued.request.sign = vi.fn(async (...args) => {
      const result = await original(...args);
      await deferred;
      return result;
    });
    const approval = extension.signingApprove({ id });
    await vi.waitFor(() => expect(queued.request.sign).toHaveBeenCalledOnce());
    revisions[topic] = 1;
    release();
    expect(await approval).toBe(false);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.error).toBeDefined();
  });
  it('does not release a signature after session change in the completion microtask', async () => {
    await dispatch();
    const id = pending()[0].id;
    const queued = substrate.getSignRequest(id)!;
    const resolve = queued.resolve;
    queued.resolve = (value) => {
      resolve(value);
      revisions[topic] = 1;
    };
    expect(await extension.signingApprove({ id })).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.error).toBeDefined();
  });
  it('binds an extrinsic genesis prefix to the requested session chain', async () => {
    const request = event({ extrinsic: true });
    request.params.request.params.transactionPayload.genesisHash = `0x${'22'.repeat(32)}`;
    await dispatch(request);
    expect(pending()).toHaveLength(0);
  });
  it('permits the same remote numeric ID in two independent sessions', async () => {
    sessions.other = { ...structuredClone(sessions[topic]), topic: 'other' };
    await dispatch();
    await dispatch(event({ topic: 'other' }));
    expect(pending()).toHaveLength(2);
    const ids = pending().map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(await extension.signingApprove({ id })).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    expect(respond.mock.calls.map(([value]) => value.topic).sort()).toEqual(['other', topic].sort());
    expect(respond.mock.calls.every(([value]) => value.response.result?.signature)).toBe(true);
  });
  it('rejects duplicate active topic/remote ID without disturbing the owner', async () => {
    await dispatch();
    const id = pending()[0].id;
    await dispatch();
    expect(pending().map((item) => item.id)).toEqual([id]);
    expect(await extension.signingApprove({ id })).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    expect(respond.mock.calls.filter(([value]) => value.response.result?.signature)).toHaveLength(1);
  });
  it('keeps a detached original topic, ID and payload if the event changes', async () => {
    const request = event();
    await dispatch(request);
    request.topic = 'other';
    request.id = 99;
    request.params.request.params.message = '0xdead';
    expect(await approveOnly()).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    const response = respond.mock.calls[0][0];
    expect(response.topic).toBe(topic);
    expect(response.response.id).toBe(1);
    expect(signatureVerify(wrapBytes('0x68656c6c6f'), response.response.result.signature, alice.address).isValid).toBe(
      true
    );
  });
});

describe('incoming Polkadot request boundaries', () => {
  it.each([-1, 0.5, NaN, Infinity])('rejects invalid remote identity %s', async (id) => {
    await dispatch(event({ id }));
    expect(pending()).toHaveLength(0);
  });

  it('accepts a chain-scoped approved namespace and SS58 alias without any proposal grant', async () => {
    const session = sessions[topic];
    session.namespaces = {
      [chainId]: { ...session.namespaces.polkadot, accounts: [`${chainId}:${encodeAddress(alice.publicKey, 2)}`] },
    };
    session.requiredNamespaces = {};
    session.optionalNamespaces = {};
    await dispatch(event({ address: encodeAddress(alice.publicKey, 42) }));
    expect(await approveOnly()).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(
      signatureVerify(wrapBytes('0x68656c6c6f'), respond.mock.calls[0][0].response.result.signature, alice.address)
        .isValid
    ).toBe(true);
  });
  it('signs an approved extrinsic with the matching reviewed genesis', async () => {
    await dispatch(event({ extrinsic: true }));
    expect(await approveOnly()).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.result.signature).toMatch(/^0x/);
  });
  it.each([
    'split grant',
    'explicit chains',
    'wrong namespace key',
    'wrong address',
    'noncanonical chain',
    'wrong protocol',
    'unknown method',
    'string message',
    'odd hex',
    'nested address',
    'raw extrinsic shape',
  ])('does not authorize %s', async (kind) => {
    const request = event({ extrinsic: kind === 'nested address' });
    const session = sessions[topic];
    if (kind === 'split grant')
      session.namespaces = {
        polkadot: { accounts: [], methods: ['polkadot_signMessage'], events: [] },
        [chainId]: { accounts: [`${chainId}:${alice.address}`], methods: [], events: [] },
      };
    if (kind === 'explicit chains') session.namespaces.polkadot.chains = [];
    if (kind === 'wrong namespace key') session.namespaces = { eip155: session.namespaces.polkadot };
    if (kind === 'wrong address')
      session.namespaces.polkadot.accounts = [`${chainId}:${encodeAddress(new Uint8Array(32).fill(3))}`];
    if (kind === 'noncanonical chain') request.params.chainId = 'polkadot:0x' + '11'.repeat(16);
    if (kind === 'wrong protocol') request.params.chainId = 'eip155:1';
    if (kind === 'unknown method') request.params.request.method = 'polkadot_signSomething';
    if (kind === 'string message') request.params.request.params.message = 'hello';
    if (kind === 'odd hex') request.params.request.params.message = '0x1';
    if (kind === 'nested address')
      request.params.request.params.transactionPayload.address = encodeAddress(new Uint8Array(32).fill(3));
    if (kind === 'raw extrinsic shape') {
      request.params.request.params = {
        address: alice.address,
        transactionPayload: event({ extrinsic: true }).params.request.params.transactionPayload,
      };
    }
    await dispatch(request);
    expect(pending()).toHaveLength(0);
  });
  it.each(['scam', 'invalid', 'mismatched origin', 'credentials', 'opaque URL'])(
    'rejects %s requester',
    async (kind) => {
      const request = event();
      request.verifyContext = { verified: { origin: url, validation: 'VALID', verifyUrl: '' } } as EventVerify;
      if (kind === 'scam') request.verifyContext.verified.isScam = true;
      if (kind === 'invalid') request.verifyContext.verified.validation = 'INVALID';
      if (kind === 'mismatched origin') request.verifyContext.verified.origin = 'https://different.example';
      if (kind === 'credentials')
        sessions[topic].peer.metadata.url = 'https://user:password@public-walletconnect.example';
      if (kind === 'opaque URL') sessions[topic].peer.metadata.url = 'data:text/plain,hello';
      await dispatch(request);
      expect(pending()).toHaveLength(0);
    }
  );
  it('still applies phishing protection before any key access', async () => {
    await dispatch();
    vi.mocked(state.keyringService.getPair).mockClear();
    vi.mocked(checkIfDenied).mockResolvedValue(true);
    expect(await approveOnly()).toBe(false);
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.error).toBeDefined();
  });
  it('checks revocation after the phishing lookup yields', async () => {
    await dispatch();
    vi.mocked(state.keyringService.getPair).mockClear();
    let release!: (value: boolean) => void;
    vi.mocked(checkIfDenied).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        })
    );
    const approval = approveOnly();
    revisions[topic] = 1;
    release(false);
    expect(await approval).toBe(false);
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
  it('publishes review fields without private session or authorization state', async () => {
    await dispatch();
    expect(Object.keys(pending()[0]).sort()).toEqual(['account', 'id', 'request', 'url']);
    expect(pending()[0].url).toBe(url);
    expect(pending()[0].account.address).toBe(alice.address);
  });
  it('supports a registered external signer with no local key pair', async () => {
    const record = {
      address: alice.address,
      publicKey: alice.publicKey,
      meta: { name: 'Public external', isExternal: true },
    };
    state.keyringService.getAllAccounts = () => [record] as never;
    vi.mocked(state.keyringService.getPair).mockReturnValue(null);
    await dispatch();
    expect(pending()).toHaveLength(1);
    const signature = `0x${Buffer.from(alice.sign(wrapBytes('0x68656c6c6f'))).toString('hex')}` as const;
    expect(await extension.signingApproveSignature({ id: pending()[0].id, signature })).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.result.signature).toBe(signature);
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
  it('invalidates an external signature when its incoming grant has changed', async () => {
    const record = {
      address: alice.address,
      publicKey: alice.publicKey,
      meta: { name: 'Public external', isExternal: true },
    };
    state.keyringService.getAllAccounts = () => [record] as never;
    await dispatch();
    revisions[topic] = 1;
    const signature = `0x${Buffer.from(alice.sign(wrapBytes('0x68656c6c6f'))).toString('hex')}` as const;
    await expect(extension.signingApproveSignature({ id: pending()[0].id, signature })).rejects.toThrow(
      /context changed/
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.error).toBeDefined();
  });
});
type EventVerify = SignClientTypes.EventArguments['session_request']['verifyContext'];

describe('live incoming WalletConnect lifecycle', () => {
  function liveService() {
    const listeners: Record<string, (event: { topic: string }) => void> = {};
    const live = Object.create(LiveWalletConnectService.prototype) as LiveWalletConnectService;
    const client = {
      session: { values: [sessions[topic]], get: (key: string) => sessions[key] },
      on: (name: string, callback: (event: { topic: string }) => void) => {
        listeners[name] = callback;
      },
      disconnect: vi.fn(async () => undefined),
      extend: vi.fn(async () => undefined),
      respond,
    };
    Object.assign(live, {
      state,
      requestService: service,
      sessionRevisions: new Map(),
      retiredTopics: new Set(),
      expiredRequestIds: new Set(),
      sessionSubject: { next: vi.fn() },
      client,
      polkadotRequestHandler: handler,
      eip155RequestHandler: { handleRequest: vi.fn() },
    });
    (live as unknown as { createListener(): void }).createListener();
    state.walletConnectService = live;
    return { live, listeners, client };
  }
  it.each(['session_delete', 'session_expire', 'disconnect'])(
    'retires %s before a stale SDK session can authorize again',
    async (kind) => {
      const { live, listeners, client } = liveService();
      await dispatch();
      let release!: () => void;
      client.disconnect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const disconnect = kind === 'disconnect' ? live.disconnect(topic) : undefined;
      if (!disconnect) listeners[kind]({ topic });
      expect(() => live.getSession(topic)).toThrow();
      expect(await approveOnly()).toBe(false);
      await dispatch(event({ id: 2 }));
      expect(pending()).toHaveLength(0);
      if (disconnect) {
        release();
        await disconnect;
      }
    }
  );
  it('invalidates even a same-value session extension by revision', async () => {
    const { listeners } = liveService();
    await dispatch();
    listeners.session_extend({ topic });
    expect(await approveOnly()).toBe(false);
  });
  it.each(['review', 'completion'])('honors SDK request expiry at %s without an explicit deadline', async (phase) => {
    const { listeners } = liveService();
    await dispatch();
    if (phase === 'review') listeners.session_request_expire({ id: 1 } as never);
    else {
      const queued = substrate.getSignRequest(pending()[0].id)!;
      const resolve = queued.resolve;
      queued.resolve = (value) => {
        resolve(value);
        listeners.session_request_expire({ id: 1 } as never);
      };
    }
    expect(await approveOnly()).toBe(phase === 'completion');
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].response.error).toBeDefined();
    await dispatch();
    expect(pending()).toHaveLength(0);
    await dispatch(event({ id: 2 }));
    expect(pending()).toHaveLength(1);
  });
  it('dispatches approved chain-scoped grants without extending expiry on receipt', async () => {
    const { live, client } = liveService();
    sessions[topic].requiredNamespaces = {};
    sessions[topic].optionalNamespaces = {};
    (live as unknown as { onSessionRequest(value: ReturnType<typeof event>): void }).onSessionRequest(event());
    expect(pending()).toHaveLength(1);
    expect(client.extend).not.toHaveBeenCalled();
    expect(await approveOnly()).toBe(true);
  });
});

describe('incoming WalletConnect client ownership', () => {
  it('shares concurrent initialization and retains the live client and its listeners', async () => {
    const live = Object.create(LiveWalletConnectService.prototype) as LiveWalletConnectService;
    const callbacks = new Map();
    const client = {
      session: { values: [] },
      on: vi.fn((event, callback) => callbacks.set(event, callback)),
      removeAllListeners: vi.fn(),
    };
    Object.assign(live, { sessionSubject: { next: vi.fn() }, sessionRevisions: new Map(), retiredTopics: new Set() });
    let release!: (client: unknown) => void;
    const initialization = new Promise((resolve) => {
      release = resolve;
    });
    const init = vi.spyOn(WalletConnect, 'init').mockReturnValue(initialization as never);
    try {
      const first = live.initClient(true),
        second = live.initClient(true);
      const calls = init.mock.calls.length;
      release(client);
      await Promise.all([first, second]);
      expect(calls).toBe(1);
      const attached = client.on.mock.calls.length;
      await live.initClient(true);
      expect(init).toHaveBeenCalledTimes(1);
      expect(client.on).toHaveBeenCalledTimes(attached);
      expect(client.removeAllListeners).not.toHaveBeenCalled();
      expect(callbacks.has('session_extend')).toBe(true);
    } finally {
      init.mockRestore();
    }
  });
  it('can retry a failed initialization without retaining a broken promise', async () => {
    const live = Object.create(LiveWalletConnectService.prototype) as LiveWalletConnectService;
    Object.assign(live, { sessionSubject: { next: vi.fn() } });
    const client = { session: { values: [] }, on: vi.fn(), removeAllListeners: vi.fn() };
    const init = vi
      .spyOn(WalletConnect, 'init')
      .mockRejectedValueOnce(new Error('Public offline fixture'))
      .mockResolvedValue(client as never);
    try {
      await expect(live.initClient(true)).rejects.toThrow('Public offline fixture');
      await live.initClient(true);
      expect(init).toHaveBeenCalledTimes(2);
      expect(client.on).toHaveBeenCalled();
    } finally {
      init.mockRestore();
    }
  });
});

describe('incoming Polkadot requests using a mobile signer', () => {
  it.each(['success', 'incoming revocation', 'outgoing revocation', 'completion revocation'])(
    'keeps both sessions bound through mobile completion: %s',
    async (outcome) => {
      const mobileTopic = 'public-mobile-signer';
      let mobileRevision = 0;
      const mobileSession = { ...structuredClone(sessions[topic]), topic: mobileTopic };
      const record = {
        address: alice.address,
        publicKey: alice.publicKey,
        meta: { name: 'Public mobile', isMobile: true, wcTopic: mobileTopic },
      };
      state.keyringService.getAllAccounts = () => [record] as never;
      vi.mocked(state.keyringService.getPair).mockReturnValue(null);
      let release!: () => void;
      const transport = new Promise<void>((resolve) => {
        release = resolve;
      });
      const onRequest = vi.fn(async () => {
        await transport;
        return { signature: `0x${Buffer.from(alice.sign(wrapBytes('0x68656c6c6f'))).toString('hex')}` };
      });
      state.walletConnectDappService = {
        getSession: () => mobileSession,
        getSessionRevision: () => mobileRevision,
        onRequest,
      } as never;
      await dispatch();
      if (outcome === 'completion revocation') {
        const queued = substrate.getSignRequest(pending()[0].id)!;
        const resolve = queued.resolve;
        queued.resolve = (value) => {
          resolve(value);
          mobileRevision += 1;
        };
      }
      const approval = approveOnly();
      await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce());
      if (outcome === 'incoming revocation') revisions[topic] = 1;
      if (outcome === 'outgoing revocation') mobileRevision = 1;
      release();
      expect(await approval).toBe(outcome === 'success' || outcome === 'completion revocation');
      await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
      if (outcome === 'success')
        expect(
          signatureVerify(wrapBytes('0x68656c6c6f'), respond.mock.calls[0][0].response.result.signature, alice.address)
            .isValid
        ).toBe(true);
      else expect(respond.mock.calls[0][0].response.error).toBeDefined();
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
    }
  );
});

describe('completed Polkadot request continuity', () => {
  it.each(['account', 'key', 'network', 'metadata'])(
    'does not release a result when %s changes in the completion microtask',
    async (kind) => {
      await dispatch(event({ extrinsic: kind === 'network' || kind === 'metadata' }));
      const id = pending()[0].id,
        queued = substrate.getSignRequest(id)!;
      const resolve = queued.resolve;
      queued.resolve = (value) => {
        resolve(value);
        if (kind === 'account') state.keyringService.getAllAccounts = () => [];
        if (kind === 'key')
          vi.mocked(state.keyringService.getPair).mockReturnValue(
            new Keyring({ type: 'sr25519' }).addFromUri('//Bob') as never
          );
        if (kind === 'network')
          state.networkService.networkMap = {
            New: { name: 'New', genesisHash: genesis, ecosystem: 'substrate' },
          } as never;
        if (kind === 'metadata')
          Object.assign(service, {
            knownMetadata: [{ genesisHash: genesis, chain: 'New metadata', specVersion: 1, types: {} }],
          });
      };
      expect(await extension.signingApprove({ id })).toBe(true);
      await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
      expect(respond.mock.calls[0][0].response.error).toBeDefined();
    }
  );
  it.each([1, NaN, Infinity, 2000000000.5])(
    'rejects invalid or expired request deadline %s before admission',
    async (expiryTimestamp) => {
      const request = event();
      request.params.request.expiryTimestamp = expiryTimestamp;
      await dispatch(request);
      expect(pending()).toHaveLength(0);
    }
  );
  it('checks the request deadline again before key access', async () => {
    const request = event();
    request.params.request.expiryTimestamp = Math.floor(Date.now() / 1000) + 60;
    await dispatch(request);
    vi.mocked(state.keyringService.getPair).mockClear();
    const now = vi.spyOn(Date, 'now').mockReturnValue((request.params.request.expiryTimestamp + 1) * 1000);
    try {
      expect(await approveOnly()).toBe(false);
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
});
