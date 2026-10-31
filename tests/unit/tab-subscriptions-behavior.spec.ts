import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import Tabs from '@extension-base/background/handlers/Tabs';
import type State from '@extension-base/background/handlers/State';
import type { AuthUrls, MessageTypes, Port } from '@extension-base/background/types/types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import { encodeIrohaI105Address } from '@/util/iroha';

const mocks = vi.hoisted(() => ({
  denied: vi.fn(), storage: vi.fn(), simulate: vi.fn(), fee: vi.fn(),
  permission: vi.fn(), events: vi.fn(), evmRequest: vi.fn(), evmSend: vi.fn(),
}));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` },
  storage: { local: { set: mocks.storage } },
} }));
vi.mock('@extension-base/services/eip-service', () => ({ EipService: class {
  requestEvmPermission = mocks.permission;
  evmSubscribeEvents = mocks.events;
  handleEvmRequest = mocks.evmRequest;
  handleEvmSend = mocks.evmSend;
} }));
vi.mock('@extension-base/services/solana-rpc-service', () => ({
  createClusterBoundSolanaRpcClient: () => ({ simulateTransaction: mocks.simulate, getFeeForMessage: mocks.fee }),
}));

const url = 'https://public.example';
const solanaAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const publicKeyHex = '12'.repeat(32);
const irohaAddress = encodeIrohaI105Address(publicKeyHex, 'nexus');
const account = (address = 'public-substrate', name = 'Public fixture'): SubjectInfo => ({ [address]: {
  type: 'sr25519', json: { address, meta: { name, solanaAddress, irohaPublicKeyHex: publicKeyHex } },
} } as unknown as SubjectInfo);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let grants: AuthUrls;
let accounts: BehaviorSubject<SubjectInfo>, addresses: BehaviorSubject<SubjectInfo>, authorization: BehaviorSubject<AuthUrls>;
let tabs: Tabs, state: State, port: Port;
let callbacks: Map<string, ReturnType<typeof vi.fn>>, cleanups: Map<string, () => void>, disconnect: (() => void)[];
function call(type: MessageTypes, request: unknown = null, id = 'page-request') {
  return tabs.handle(id, type, request as never, url, port);
}
beforeEach(() => {
  vi.clearAllMocks();
  grants = { [url]: { isAllowed: true, authorizedAccounts: ['public-substrate', 'mobile'], solanaAuthorizedAccount: solanaAddress, irohaAuthorizedAccount: irohaAddress } } as unknown as AuthUrls;
  accounts = new BehaviorSubject(account()); addresses = new BehaviorSubject(account('mobile', 'Mobile'));
  authorization = new BehaviorSubject(grants); callbacks = new Map(); cleanups = new Map(); disconnect = [];
  port = { onDisconnect: { addListener: (listener: () => void) => disconnect.push(listener) } } as unknown as Port;
  state = {
    getAuthInfo: vi.fn(async () => grants[url]),
    keyringService: {
      accountSubject: accounts, addressSubject: addresses,
      getAllSubstrateAccounts: vi.fn(() => [{ address: 'public-substrate' }]),
      getAllAccounts: vi.fn(() => [{ address: 'public-substrate', meta: { name: 'Public fixture' } }]),
      encodeAddress: (address: string) => address,
      getAddress: vi.fn(() => ({ meta: { name: 'Public fixture', ethereumAddress: '0x1234' } })),
    },
    requestService: {
      getAuthList: vi.fn(async () => grants),
      ensureUrlAuthorized: vi.fn(async () => undefined),
      authorizeUrl: vi.fn(async () => true),
      authRequestHandler: { getSigningAuthorizationSnapshot: () => ({ authorization: grants[url] }) },
      mutateAuthorizations: vi.fn(async (mutate: (entries: AuthUrls) => void) => { mutate(grants); authorization.next(grants); }),
      subscribeAuthorizeUrlSubject: authorization,
      solanaRequestHandler: {
        confirmSignMessage: vi.fn(async () => ({ signature: 'message-signature' })),
        confirmSignTransaction: vi.fn(async () => ({ transactionBase64: 'signed' })),
        confirmSignAllTransactions: vi.fn(async () => ({ transactionsBase64: ['signed'] })),
        confirmSignAndSendTransaction: vi.fn(async () => ({ signature: 'broadcast-signature' })),
      },
      substrateRequestHandler: { sign: vi.fn(async () => ({ id: 'private-queue-key', payload: { signature: '0x1234' } })) },
      knownMetadata: [{ genesisHash: '0xabc', specVersion: 7, chain: 'private details' }],
      injectMetadata: vi.fn(async () => true),
    },
    subscriptionService: {
      createSubscription: vi.fn((id: string) => { const cb = vi.fn(); callbacks.set(id, cb); return cb; }),
      setUnsubscriptionHandle: vi.fn((id: string, cleanup: () => void) => cleanups.set(id, cleanup)),
      cancelSubscription: vi.fn((id: string) => { cleanups.get(id)?.(); cleanups.delete(id); }),
    },
    rpcListProviders: vi.fn(() => ({ public: { name: 'Public network' } })),
    rpcSend: vi.fn(async () => ({ result: 'rpc-result' })),
    rpcStartProvider: vi.fn(() => ({ name: 'Public network' })),
    rpcSubscribe: vi.fn(async () => 42), rpcSubscribeConnected: vi.fn(), rpcUnsubscribe: vi.fn(async () => true),
  } as unknown as State;
  tabs = new Tabs(state);
});

describe('tab account discovery and subscription lifecycle', () => {
  it('combines wallet and mobile accounts while honoring a restricted grant', async () => {
    grants[url].authorizedAccounts = ['mobile'];
    expect(await call('pub(accounts.list)')).toEqual([{ address: 'mobile', name: 'Mobile', type: 'sr25519', genesisHash: '' }]);
    delete grants[url].authorizedAccounts;
    expect(await tabs.accountsListAuthorized(url)).toHaveLength(2);
  });
  for (const protocol of ['solana', 'iroha'] as const) {
    const list = () => protocol === 'solana' ? tabs.solanaAccountsAuthorized(url) : tabs.irohaAccountsAuthorized(url);
    const connect = (silent = false) => protocol === 'solana' ? tabs.solanaAuthorizeUrl(url, { origin: 'Public app', silent }) : tabs.irohaAuthorizeUrl(url, { origin: 'Public app', silent });
    const subscribe = () => protocol === 'solana' ? tabs.solanaSubscribeAccounts(url, 'events', port) : tabs.irohaSubscribeAccounts(url, null, 'events', port);
    it(`${protocol} returns the selected account only once across wallet and mobile entries`, async () => {
      const result = await list();
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]).toMatchObject({ address: protocol === 'solana' ? solanaAddress : irohaAddress, name: 'Public fixture' });
    });
    it.each([false, 'false', undefined])(`${protocol} hides accounts for a revoked or malformed grant (%s)`, async (allowed) => {
      grants[url].isAllowed = allowed as boolean;
      expect(await list()).toEqual({ accounts: [] });
    });
    it(`${protocol} silent connect does not open an approval`, async () => {
      expect((await connect(true)).accounts).toHaveLength(1);
      expect(state.requestService.authorizeUrl).not.toHaveBeenCalled();
    });
    it(`${protocol} requests a protocol-specific grant`, async () => {
      expect((await connect()).accounts).toHaveLength(1);
      expect(state.requestService.authorizeUrl).toHaveBeenCalledWith(url, expect.objectContaining({ origin: 'Public app', accountAuthType: protocol }));
      if (protocol === 'iroha') expect(state.requestService.authorizeUrl).toHaveBeenCalledWith(url, expect.objectContaining({ allowedAccounts: [irohaAddress] }));
    });
    it(`${protocol} does not open approval with no compatible accounts`, async () => {
      accounts.next({}); addresses.next({});
      expect(await connect()).toEqual({ accounts: [] });
      expect(state.requestService.authorizeUrl).not.toHaveBeenCalled();
    });
    it(`${protocol} disconnect clears only that protocol's grant and tolerates missing sites`, async () => {
      await call(`${protocol}(disconnect)`);
      expect(grants[url][protocol === 'solana' ? 'solanaAuthorizedAccount' : 'irohaAuthorizedAccount']).toBe('');
      expect(grants[url].authorizedAccounts).toEqual(['public-substrate', 'mobile']);
      delete grants[url];
      await expect(call(`${protocol}(disconnect)`)).resolves.toEqual({ accounts: [] });
    });
    it(`${protocol} emits changed accounts once and releases all observers on disconnect`, async () => {
      await subscribe(); await flush();
      expect(callbacks.get('events')).toHaveBeenCalledTimes(1);
      accounts.next(account()); addresses.next(account('mobile', 'Mobile')); await flush();
      expect(callbacks.get('events')).toHaveBeenCalledTimes(1);
      grants[url][protocol === 'solana' ? 'solanaAuthorizedAccount' : 'irohaAuthorizedAccount'] = '';
      authorization.next(grants); await flush();
      expect(callbacks.get('events')).toHaveBeenLastCalledWith({ accounts: [] });
      expect(callbacks.get('events')).toHaveBeenCalledTimes(2);
      disconnect.forEach((listener) => listener());
      expect(accounts.observed).toBe(false); expect(addresses.observed).toBe(false); expect(authorization.observed).toBe(false);
    });
    it(`${protocol} does not deliver an account lookup after the tab disconnects`, async () => {
      let finish!: () => void;
      vi.mocked(state.getAuthInfo).mockImplementation(() => new Promise((resolve) => { finish = () => resolve(grants[url]); }));
      // Only the final explicit lookup needs to finish; observer lookups remain pending.
      const pending = subscribe();
      disconnect.forEach((listener) => listener()); finish();
      await pending;
      expect(callbacks.get('events')).not.toHaveBeenCalled();
    });
  }
  it('uses the requested Iroha network and its address encoding', async () => {
    const taira = encodeIrohaI105Address(publicKeyHex, 'taira');
    grants[url].irohaAuthorizedAccount = taira;
    expect(await call('iroha(authorizeUrl)', { network: 'taira', origin: 'Public app' })).toEqual({ accounts: [expect.objectContaining({ address: taira, network: 'taira', chain: 'iroha:taira' })] });
  });
  it('subscribes Substrate accounts, persists the transformed list, and enforces unsubscribe ownership', async () => {
    expect(await call('pub(accounts.subscribe)', null, 'account-events')).toBe('account-events'); await flush();
    expect(callbacks.get('account-events')).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ address: 'public-substrate' })]));
    expect(mocks.storage).toHaveBeenCalledWith({ transformAccounts: expect.arrayContaining([expect.objectContaining({ address: 'mobile' })]) });
    expect(tabs.accountsUnsubscribe('https://other.example', { id: 'account-events' })).toBe(false);
    expect(await call('pub(accounts.unsubscribe)', { id: 'account-events' })).toBe(true);
    expect(tabs.accountsUnsubscribe(url, { id: 'account-events' })).toBe(false);
    expect(accounts.observed).toBe(false);
  });
  it('updates Substrate subscribers when a mobile account or site grant changes', async () => {
    await call('pub(accounts.subscribe)', null, 'account-events'); await flush();
    addresses.next({}); await flush();
    expect(callbacks.get('account-events')).toHaveBeenLastCalledWith([{ address: 'public-substrate', name: 'Public fixture', type: 'sr25519' }]);
    grants[url].isAllowed = false; authorization.next(grants); await flush();
    expect(callbacks.get('account-events')).toHaveBeenLastCalledWith([]);
    disconnect.forEach((listener) => listener());
    expect(addresses.observed).toBe(false); expect(authorization.observed).toBe(false);
  });
  it('does not republish removed Substrate accounts when an older publication finishes last', async () => {
    await call('pub(accounts.subscribe)', null, 'account-events'); await flush();
    const publish = callbacks.get('account-events')!;
    let release!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { release = resolve; });
    mocks.storage.mockReturnValueOnce(pendingWrite);
    accounts.next(account('public-substrate', 'Old snapshot'));
    expect(mocks.storage).toHaveBeenLastCalledWith({ transformAccounts: expect.arrayContaining([
      expect.objectContaining({ address: 'public-substrate', name: 'Old snapshot' }),
      expect.objectContaining({ address: 'mobile' }),
    ]) });
    try {
      accounts.next({}); addresses.next({}); await flush();
      expect(publish).toHaveBeenLastCalledWith([]);
      publish.mockClear();
      release(); await flush();
      expect(publish).not.toHaveBeenCalled();
    } finally {
      release();
      disconnect.forEach((listener) => listener());
      await flush();
    }
  });
  it('publishes authorized account changes when every ancillary cache write rejects', async () => {
    const failure = new Error('Cache quota unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.storage.mockRejectedValue(failure);
    try {
      await call('pub(accounts.subscribe)', null, 'account-events'); await flush();
      const publish = callbacks.get('account-events')!;
      const initial = publish.mock.calls[publish.mock.calls.length - 1][0];
      expect(initial.map((item: { address: string }) => item.address)).toEqual(['public-substrate', 'mobile']);
      grants[url].isAllowed = false; authorization.next(grants); await flush();
      expect(publish).toHaveBeenLastCalledWith([]);
      expect(log).toHaveBeenCalledWith(failure);
    } finally {
      disconnect.forEach((listener) => listener());
      await flush();
      mocks.storage.mockReset();
      log.mockRestore();
    }
  });
  it('keeps the newest account list when an older permission lookup finishes last', async () => {
    await call('pub(accounts.subscribe)', null, 'account-events'); await flush();
    const publish = callbacks.get('account-events')!;
    let release!: (value: AuthUrls) => void;
    const pendingPermission = new Promise<AuthUrls>((resolve) => { release = resolve; });
    vi.mocked(state.requestService.getAuthList).mockReturnValueOnce(pendingPermission);
    try {
      accounts.next(account('public-substrate', 'Old permission snapshot'));
      accounts.next({}); addresses.next({}); await flush();
      expect(publish).toHaveBeenLastCalledWith([]);
      publish.mockClear();
      release(grants); await flush();
      expect(publish).not.toHaveBeenCalled();
    } finally {
      release(grants);
      disconnect.forEach((listener) => listener());
      await flush();
    }
  });
  it('does not deliver an in-flight Substrate account lookup after disconnect', async () => {
    let finish!: () => void;
    vi.mocked(state.requestService.getAuthList).mockImplementation(() => new Promise((resolve) => { finish = () => resolve(grants); }));
    await call('pub(accounts.subscribe)', null, 'account-events');
    disconnect.forEach((listener) => listener()); finish(); await flush();
    expect(callbacks.get('account-events')).not.toHaveBeenCalled();
  });
});

describe('tab signing and provider boundaries', () => {
  it.each([
    ['solana(signMessage)', 'confirmSignMessage', { messageBase64: 'AQID', origin: 'Public app' }],
    ['solana(signTransaction)', 'confirmSignTransaction', { transactionBase64: 'AQID', origin: 'Public app' }],
    ['solana(signAllTransactions)', 'confirmSignAllTransactions', { transactionsBase64: ['AQID'], origin: 'Public app' }],
  ] as const)('%s forwards only the authorized account to approval', async (type, method, request) => {
    await call(type, request);
    expect(state.requestService.solanaRequestHandler[method]).toHaveBeenCalledWith(url, request, { address: solanaAddress, name: 'Public fixture', publicKey: solanaAddress });
    grants[url].isAllowed = false;
    await expect(call(type, request)).rejects.toThrow('not authorized');
    expect(state.requestService.solanaRequestHandler[method]).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 'finalized'] as const)('supplies simulation and fee lookups using preflight commitment %s', async (commitment) => {
    const request = { origin: 'Public app', transactionBase64: 'AQID', options: { preflightCommitment: commitment } };
    await call('solana(signAndSendTransaction)', request);
    const invocation = vi.mocked(state.requestService.solanaRequestHandler.confirmSignAndSendTransaction).mock.calls[0];
    expect(invocation.slice(0, 3)).toEqual([url, request, expect.objectContaining({ address: solanaAddress })]);
    await invocation[4]!('transaction'); await invocation[5]!('message');
    expect(mocks.simulate).toHaveBeenCalledWith('transaction', { commitment: commitment ?? 'confirmed', replaceRecentBlockhash: true, sigVerify: false });
    expect(mocks.fee).toHaveBeenCalledWith('message', commitment ?? 'confirmed');
  });
  it.each(['pub(bytes.sign)', 'pub(extrinsic.sign)'] as const)('%s releases the page message id, never the private queue key', async (type) => {
    const request = { address: 'public-substrate', data: '0x1234', type: 'bytes', version: 4 };
    expect(await call(type, request)).toEqual({ id: 'page-request', payload: { signature: '0x1234' } });
    expect(state.requestService.substrateRequestHandler.sign).toHaveBeenCalledWith(url, expect.objectContaining({ payload: request }), expect.objectContaining({ name: 'Public fixture', address: 'public-substrate', ethereumAddress: '0x1234' }));
    vi.mocked(state.keyringService.getAddress).mockReturnValue(undefined);
    await call(type, request);
    expect(state.requestService.substrateRequestHandler.sign).toHaveBeenLastCalledWith(url, expect.anything(), { address: 'public-substrate', name: '', ethereumAddress: '' });
  });
  it('projects metadata and forwards provided metadata for approval', async () => {
    expect(await call('pub(metadata.list)')).toEqual([{ genesisHash: '0xabc', specVersion: 7 }]);
    const metadata = { genesisHash: '0xdef', specVersion: 9 };
    expect(await call('pub(metadata.provide)', metadata)).toBe(true);
    expect(state.requestService.injectMetadata).toHaveBeenCalledWith(url, metadata);
  });
  it('lists, starts, and sends through the provider bound to the tab port', async () => {
    expect(await call('pub(rpc.listProviders)')).toEqual({ public: { name: 'Public network' } });
    expect(await call('pub(rpc.startProvider)', 'public')).toEqual({ name: 'Public network' });
    const request = { method: 'chain_getBlockHash', params: [1] };
    expect(await call('pub(rpc.send)', request)).toEqual({ result: 'rpc-result' });
    expect(state.rpcStartProvider).toHaveBeenCalledWith('public', port);
    expect(state.rpcSend).toHaveBeenCalledWith(request, port);
  });
  it('forwards RPC subscription data and unsubscribes the provider on disconnect', async () => {
    const request = { type: 'chain', method: 'chain_subscribeNewHeads', params: [] };
    expect(await call('pub(rpc.subscribe)', request, 'rpc-events')).toBe(true);
    vi.mocked(state.rpcSubscribe).mock.calls[0][1](null, { number: 12 });
    expect(callbacks.get('rpc-events')).toHaveBeenCalledWith({ number: 12 });
    disconnect.forEach((listener) => listener()); await flush();
    expect(state.rpcUnsubscribe).toHaveBeenCalledWith({ ...request, subscriptionId: 42 }, port);
    expect(state.subscriptionService.cancelSubscription).toHaveBeenCalledWith('rpc-events');
  });
  it('forwards provider connection status and cancels it on disconnect', async () => {
    await call('pub(rpc.subscribeConnected)', null, 'connected');
    vi.mocked(state.rpcSubscribeConnected).mock.calls[0][1](null, true);
    expect(callbacks.get('connected')).toHaveBeenCalledWith(true);
    disconnect.forEach((listener) => listener());
    expect(state.subscriptionService.cancelSubscription).toHaveBeenCalledWith('connected');
  });
  it('checks phishing before authorization and propagates denial', async () => {
    mocks.denied.mockResolvedValue(true);
    expect(await call('pub(phishing.redirectIfDenied)')).toBe(true);
    expect(mocks.denied).toHaveBeenCalledWith(url);
    expect(state.requestService.ensureUrlAuthorized).not.toHaveBeenCalled();
  });
  it.each(['pub(authorize.tab)', 'evm(authorizeUrl)', 'evm(events.subscribe)', 'evm(request)'] as const)('does not invoke %s without a compatible wallet', async (type) => {
    vi.mocked(state.keyringService.getAllSubstrateAccounts).mockReturnValue([]);
    vi.mocked(state.keyringService.getAllAccounts).mockReturnValue([]);
    if (type === 'pub(authorize.tab)') await expect(call(type, {})).rejects.toThrow('no Substrate account');
    else await expect(call(type, {})).resolves.toBeUndefined();
    expect(state.requestService.authorizeUrl).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled(); expect(mocks.events).not.toHaveBeenCalled(); expect(mocks.evmRequest).not.toHaveBeenCalled();
  });
  it('rejects unknown messages and stops privileged RPC when authorization rejects', async () => {
    await expect(call('unknown' as MessageTypes)).rejects.toThrow('Unable to handle');
    vi.mocked(state.requestService.ensureUrlAuthorized).mockRejectedValue(new Error('Site revoked'));
    await expect(call('pub(rpc.send)', {})).rejects.toThrow('Site revoked');
    expect(state.rpcSend).not.toHaveBeenCalled();
  });
});
