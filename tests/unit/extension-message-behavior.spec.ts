import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { getInternalError } from '@walletconnect/utils';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { MessageTypes, Port } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

const boundary = vi.hoisted(() => ({ query: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` }, tabs: { query: boundary.query, update: boundary.update, create: boundary.create } } }));
const subject = <T,>(value: T) => new BehaviorSubject(value);
const account = (address: string, name: string, type = 'sr25519') => ({ [address]: { type, json: { address, meta: { name, walletSecurityGeneration: 1 } } } });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let extension: Extension, state: ReturnType<typeof fixture>;
let port: Port, disconnected: (() => void)[], callbacks: Map<string, ReturnType<typeof vi.fn>>, cleanups: Map<string, () => void>;
function fixture() {
  const priceSubject = subject({ currency: 'USD' });
  const networkMap = Object.fromEntries(['substrate', 'ethereumBased', 'ethereum', 'ton', 'solana', 'bitcoin', 'iroha'].map(ecosystem => [ecosystem, { name: ecosystem, ecosystem, chainId: ecosystem === 'ethereum' ? '1' : 'chain', active: true }]));
  return {
    currentAccount: { address: 'alice' }, isReady: vi.fn(() => true), updateCurrentAccount: vi.fn().mockResolvedValue(undefined), updateNetworkForNewWallet: vi.fn(), saveMetadata: vi.fn(),
    keyringService: {
      isResetting: false, getPassword: () => 'public-test-password', getAllAccounts: () => [{ address: 'alice', meta: { walletSecurityGeneration: 1 } }],
      getAllMainAccounts: vi.fn((): Array<{ address: string; meta: Record<string, unknown> }> => [{ address: 'alice', meta: {} }]),
      getPair: () => ({ haveEntropy: true }), getSubstrateAddress: () => 'alice',
      restoreDeletedWallet: vi.fn(), changeMasterPassword: vi.fn().mockResolvedValue(true), lockKeyring: vi.fn(() => true),
      accountSubject: subject(account('alice', 'Alice')), addressSubject: subject(account('mobile', 'Mobile')),
      currentAccountSubject: subject({ address: 'alice' }), lockSubject: subject(false),
      tonKeyring: { getAccounts: () => [], accountSubject: subject(account('ton-alice', 'TON Alice', 'ton')) },
    },
    keyringLockService: { lockIfExpired: vi.fn(), lockTimerIsExist: vi.fn(() => false), clearLockTimer: vi.fn(), setExtensionAutoLockTimeout: vi.fn() },
    networkService: { networkMap, selectedNetworks: { alice: 'substrate' }, networkMapStore: { getSubject: () => subject(networkMap) }, selectedNetworksStore: { getSubject: () => subject({ alice: 'substrate' }) } },
    subscriptionService: { createSubscription: vi.fn((id: string) => { const cb = vi.fn(); callbacks.set(id, cb); return cb; }), setUnsubscriptionHandle: (id: string, cleanup: () => void) => cleanups.set(id, cleanup), cancelSubscription: vi.fn((id: string) => { cleanups.get(id)?.(); cleanups.delete(id); return true; }) },
    requestService: {
      getAuthList: vi.fn().mockResolvedValue({}), getMetaRequest: vi.fn(), getConnectWCRequest: vi.fn(), getNotSupportWCRequest: vi.fn(),
      metaSubject: subject<unknown[]>([]), signSubject: subject<unknown[]>([]), signEvmSubject: subject<unknown[]>([]), signSolanaSubject: subject<unknown[]>([]), connectWCSubject: subject<unknown[]>([]), signWcSubject: subject<unknown[]>([]), notSupportWCSubject: subject<unknown[]>([]),
      allConnectWCRequests: [], allNotSupportWCRequests: [],
    },
    authSubject: subject<unknown[]>([]), soraFees: subject({ swap: '0.1' }),
    balanceService: { fetchBalance: vi.fn().mockResolvedValue([{ balance: '1' }]), balanceSubject: subject({ alice: [] }), getBalance: vi.fn().mockResolvedValue({ alice: [] }), evmBalanceService: { fetchBalance: vi.fn() } },
    pricesService: { setFiatSymbol: vi.fn(), refreshPrice: vi.fn(), getSubject: () => priceSubject, getPrice: (cb: (value: unknown) => void) => cb(priceSubject.value) },
    walletConnectService: { connect: vi.fn().mockResolvedValue(undefined), approveSession: vi.fn().mockResolvedValue(undefined), rejectSession: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined), sessionSubject: subject<unknown[]>([]), sessions: [] },
  };
}
function call(type: MessageTypes, request: unknown = null, id = 'request') { return extension.handle(id, type, request as never, port); }
beforeEach(() => {
  vi.clearAllMocks(); boundary.query.mockResolvedValue([]); boundary.create.mockResolvedValue({});
  disconnected = []; callbacks = new Map(); cleanups = new Map();
  port = { onDisconnect: { addListener: (fn: () => void) => disconnected.push(fn) } } as unknown as Port;
  state = fixture(); extension = new Extension(state as unknown as State);
});
afterEach(() => { disconnected.forEach(fn => fn()); });

describe('extension account and metadata messages', () => {
  it('returns and publishes the same ecosystem for TON and Substrate wallets', async () => {
    const initial = await call('pri(accounts.subscribe)', null, 'accounts') as Array<{ address: string; walletEcosystem: string }>;
    expect(initial.find(item => item.address === 'ton-alice')?.walletEcosystem).toBe(WalletEcosystem.Ton);
    expect(callbacks.get('accounts')).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ address: 'ton-alice', walletEcosystem: WalletEcosystem.Ton })]));
    state.currentAccount = { address: 'mobile' }; state.keyringService.currentAccountSubject.next({ address: 'mobile' });
    expect(callbacks.get('accounts')).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ address: 'mobile', active: true }), expect.objectContaining({ address: 'alice', active: false })]));
    state.keyringService.addressSubject.next(account('bob', 'Bob')); state.keyringService.accountSubject.next(account('alice', 'Renamed Alice')); state.keyringService.tonKeyring.accountSubject.next(account('ton-bob', 'TON Bob', 'ton'));
    expect(callbacks.get('accounts')).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ address: 'bob' }), expect.objectContaining({ name: 'Renamed Alice' }), expect.objectContaining({ address: 'ton-bob' })]));
    disconnected.forEach(fn => fn()); expect(state.keyringService.accountSubject.observed).toBe(false); expect(state.keyringService.addressSubject.observed).toBe(false); expect(state.keyringService.tonKeyring.accountSubject.observed).toBe(false); expect(state.keyringService.currentAccountSubject.observed).toBe(false);
  });
  it.each([WalletEcosystem.Substrate, WalletEcosystem.Ton, WalletEcosystem.Solana])('selects a restored %s wallet and initializes its networks when needed', async walletEcosystem => {
    state.keyringService.restoreDeletedWallet.mockResolvedValue({ ok: true, address: 'restored', walletEcosystem });
    expect(await extension.restoreDeletedWallet({ id: 'deleted' })).toMatchObject({ ok: true });
    expect(state.updateCurrentAccount).toHaveBeenCalledWith({ address: 'restored', walletEcosystem });
    if (walletEcosystem === WalletEcosystem.Ton) expect(state.updateNetworkForNewWallet).not.toHaveBeenCalled(); else expect(state.updateNetworkForNewWallet).toHaveBeenCalledWith('restored');
  });
  it('does not change selection on a failed restore and defaults old backups to Substrate', async () => {
    state.keyringService.restoreDeletedWallet.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, address: 'restored' });
    await extension.restoreDeletedWallet({ id: 'missing' }); expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    await extension.restoreDeletedWallet({ id: 'old' }); expect(state.updateCurrentAccount).toHaveBeenCalledWith({ address: 'restored', walletEcosystem: WalletEcosystem.Substrate });
  });
  it('only accepts the current password and resets auto-lock after a successful password change', async () => {
    expect(extension.accountsValidatePassword({ password: 'wrong' } as never)).toBe(false); expect(extension.accountsValidatePassword({ password: 'public-test-password' } as never)).toBe(true);
    expect(await extension.changeMasterPassword({} as never)).toBe(true); expect(state.keyringLockService.setExtensionAutoLockTimeout).toHaveBeenCalledOnce();
    state.keyringService.changeMasterPassword.mockResolvedValueOnce(false); expect(await extension.changeMasterPassword({} as never)).toBe(false); expect(state.keyringLockService.setExtensionAutoLockTimeout).toHaveBeenCalledOnce();
  });
  it('honors the auto-lock timer unless locking is explicitly forced', () => {
    state.keyringLockService.lockTimerIsExist.mockReturnValue(true); expect(extension.lockKeyring(false)).toBe(false); expect(state.keyringService.lockKeyring).not.toHaveBeenCalled();
    expect(extension.lockKeyring(true)).toBe(true); expect(state.keyringLockService.clearLockTimer).toHaveBeenCalledOnce(); expect(state.keyringService.lockKeyring).toHaveBeenCalledOnce();
  });
  it('approves or rejects queued metadata and reports missing requests', async () => {
    const queued = { request: { genesisHash: '0x1234', specVersion: 1 }, resolve: vi.fn(), reject: vi.fn() };
    state.requestService.getMetaRequest.mockReturnValue(queued);
    expect(await call('pri(metadata.approve)', { id: 'metadata' })).toBe(true); expect(state.saveMetadata).toHaveBeenCalledWith(queued.request); expect(queued.resolve).toHaveBeenCalledWith(true);
    expect(await call('pri(metadata.reject)', { id: 'metadata' })).toBe(true); expect(queued.reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Rejected' }));
    state.requestService.getMetaRequest.mockReturnValue(undefined); await expect(extension.metadataApprove({ id: 'missing' })).rejects.toThrow('Unable to find request'); expect(() => extension.metadataReject({ id: 'missing' })).toThrow('Unable to find request');
  });
  it.each([undefined, 'chrome://extensions', 'not a URL'])('tolerates an unavailable or internal active tab %s', async url => {
    boundary.query.mockResolvedValue([{ url }]); expect(await extension.isTabAuthorize()).toEqual({ isAuthorize: false, authorizeAccountsCount: 0, dAppName: '' });
  });
  it('reads exact-origin tab grants and tolerates legacy grants without an explicit account list', async () => {
    boundary.query.mockResolvedValue([{ url: 'https://app.example/path' }]); state.requestService.getAuthList.mockResolvedValue({ 'https://app.example': { isAllowed: true, authorizedAccounts: ['alice'] } });
    expect(await extension.isTabAuthorize()).toEqual({ isAuthorize: true, authorizeAccountsCount: 1, dAppName: 'app.example' });
    state.requestService.getAuthList.mockResolvedValue({ 'https://app.example': { isAllowed: true } });
    expect(await extension.isTabAuthorize()).toEqual({ isAuthorize: true, authorizeAccountsCount: 0, dAppName: 'app.example' });
  });
  it('focuses an existing wallet tab or creates the requested popup route', async () => {
    boundary.query.mockResolvedValueOnce([{ id: 7 }]); expect(await extension.windowOpen('/wallet')).toBe(true); expect(boundary.update).toHaveBeenCalledWith(7, { active: true }); expect(boundary.create).not.toHaveBeenCalled();
    await extension.windowOpen('/settings'); await flush(); expect(boundary.create).toHaveBeenCalledWith({ url: 'chrome-extension://fixture/popup.html#/settings' });
  });
});

describe('extension subscriptions', () => {
  for (const [message, getSubject] of [
    ['pri(authorize.requests)', () => state.authSubject], ['pri(metadata.requests)', () => state.requestService.metaSubject],
    ['pri(signing.requests)', () => state.requestService.signSubject], ['pri(signing.evmRequests)', () => state.requestService.signEvmSubject], ['pri(signing.solanaRequests)', () => state.requestService.signSolanaSubject],
    ['pri(walletConnect.requests.connect.subscribe)', () => state.requestService.connectWCSubject], ['pri(walletConnect.session.subscribe)', () => state.walletConnectService.sessionSubject],
    ['pri(walletConnect.signing.requests.subscribe)', () => state.requestService.signWcSubject], ['pri(walletConnect.requests.notSupport.subscribe)', () => state.requestService.notSupportWCSubject],
  ] as const) {
    it(`${message} publishes initial and changed data and detaches on disconnect`, async () => {
      const subject = getSubject(); expect(await call(message, null, 'subscription')).toEqual([]);
      subject.next([{ id: 'new-request' }]); expect(callbacks.get('subscription')).toHaveBeenLastCalledWith([{ id: 'new-request' }]);
      disconnected.forEach(fn => fn()); expect(subject.observed).toBe(false);
      callbacks.get('subscription')!.mockClear(); subject.next([]); expect(callbacks.get('subscription')).not.toHaveBeenCalled();
    });
  }
  it('publishes balances, prices and fees and releases their streams', async () => {
    expect(await call('pri(balance.subscription)', null, 'balances')).toEqual({ alice: [] });
    expect(await call('pri(price.subscription)', null, 'prices')).toEqual({ currency: 'USD' });
    await call('pri(accounts.soraFees.subscribe)', null, 'fees');
    state.balanceService.balanceSubject.next({ alice: [] }); state.soraFees.next({ swap: '0.2' }); state.pricesService.getSubject().next({ currency: 'JPY' });
    expect(callbacks.get('fees')).toHaveBeenLastCalledWith({ swap: '0.2' }); expect(callbacks.get('prices')).toHaveBeenLastCalledWith({ currency: 'JPY' });
    disconnected.forEach(fn => fn()); expect(state.balanceService.balanceSubject.observed).toBe(false); expect(state.soraFees.observed).toBe(false); expect(state.pricesService.getSubject().observed).toBe(false);
  });
});

describe('extension balance routing', () => {
  it.each([
    [WalletEcosystem.Substrate, { substrateNetworks: ['substrate', 'ethereumBased'], evmNetworks: ['ethereum'] }],
    [WalletEcosystem.Ton, { tonNetworks: ['ton'] }], [WalletEcosystem.Solana, { solanaNetworks: ['solana'], solanaAddress: 'sol-address' }],
    [WalletEcosystem.Bitcoin, { bitcoinNetworks: ['bitcoin'], bitcoinAddress: 'btc-address', bitcoinTestnetAddress: 'btc-test' }], [WalletEcosystem.Iroha, { irohaNetworks: ['iroha'], irohaAddress: 'iroha-address' }],
  ])('routes %s balances only to compatible networks', async (walletEcosystem, expected) => {
    const request = { address: 'alice', networks: [...Object.keys(state.networkService.networkMap), 'unknown'], walletEcosystem, solanaAddress: 'sol-address', bitcoinAddress: 'btc-address', bitcoinTestnetAddress: 'btc-test', irohaAddress: 'iroha-address' };
    expect(await call('pri(fetch.balance)', request)).toEqual([{ balance: '1' }]);
    expect(state.balanceService.fetchBalance).toHaveBeenCalledExactlyOnceWith({ address: 'alice', ethereumAddress: '', walletEcosystem, ...expected });
  });
  it('routes universal wallets across every ecosystem and recovers linked public addresses from metadata', async () => {
    state.keyringService.getAllMainAccounts.mockReturnValue([{ address: 'alice', meta: { universalWallet: { publicAccounts: [{ ecosystem: 'substrate' }, { ecosystem: 'solana' }] }, solanaAddress: 'stored-sol', bitcoinAddress: 'stored-btc', bitcoinTestnetAddress: 'stored-test', irohaAddress: 'stored-iroha', ethereumAddress: 'stored-evm' } }]);
    await call('pri(fetch.balance)', { address: 'alice', networks: Object.keys(state.networkService.networkMap), walletEcosystem: WalletEcosystem.Substrate });
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({ address: 'alice', walletEcosystem: WalletEcosystem.Substrate, solanaAddress: 'stored-sol', bitcoinAddress: 'stored-btc', bitcoinTestnetAddress: 'stored-test', irohaAddress: 'stored-iroha', ethereumAddress: 'stored-evm', substrateNetworks: ['substrate', 'ethereumBased'], evmNetworks: ['ethereum'], tonNetworks: ['ton'], solanaNetworks: ['solana'], bitcoinNetworks: ['bitcoin'], irohaNetworks: ['iroha'] });
  });
  it('does not start EVM balance loading until startup has finished', async () => {
    state.isReady.mockReturnValue(false); await call('pri(fetch.evm.balance)', { assetId: 'eth', ethereumAddress: '0x1234' }); expect(state.balanceService.evmBalanceService.fetchBalance).not.toHaveBeenCalled();
    state.isReady.mockReturnValue(true); await call('pri(fetch.evm.balance)', { assetId: 'eth', ethereumAddress: '0x1234' }); expect(state.balanceService.evmBalanceService.fetchBalance).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'eth', ethereumAddress: '0x1234', networks: expect.any(Array) }));
  });
});

function proposal(overrides: Record<string, unknown> = {}) {
  const request = { request: { id: 17, params: { expiry: Math.floor(Date.now() / 1000) + 3600, relays: [{ protocol: 'irn' }], requiredNamespaces: { eip155: { chains: ['eip155:1'], methods: ['personal_sign'], events: ['accountsChanged'] } }, optionalNamespaces: {}, ...overrides } }, resolve: vi.fn(), reject: vi.fn() };
  state.requestService.getConnectWCRequest.mockReturnValue(request); return request;
}
describe('WalletConnect connection approval', () => {
  it('pairs a URI and explains known pairing failures', async () => {
    expect(await extension.connectWalletConnect({ uri: 'wc:public-fixture' })).toBe(true);
    for (const [error, message] of [[getInternalError('MISSING_OR_INVALID').message, 'walletConnect.pairingErrorMessage'], [getInternalError('UNKNOWN_TYPE').message, 'walletConnect.relayNotSupported'], ['offline', 'Unknown error']]) {
      state.walletConnectService.connect.mockRejectedValueOnce(new Error(error)); expect(await extension.connectWalletConnect({ uri: 'wc:public-fixture' })).toEqual({ message });
    }
  });
  it('builds approved namespaces from supported required and optional chains', async () => {
    const request = proposal({ optionalNamespaces: { eip155: { chains: ['eip155:1', 'eip155:999'], methods: [], events: [] }, unsupported: { chains: ['unknown:1'], methods: [], events: [] } } });
    expect(await call('pri(walletConnect.session.approve)', { id: 'proposal', accounts: ['alice'] })).toMatchObject({ status: true });
    expect(state.walletConnectService.approveSession).toHaveBeenCalledWith({ id: 17, relayProtocol: 'irn', namespaces: { eip155: { accounts: ['eip155:1:alice'], chains: ['eip155:1'], methods: expect.arrayContaining(['personal_sign']), events: ['accountsChanged'] } } }); expect(request.resolve).toHaveBeenCalledOnce();
  });
  it.each([{ expiry: 1 }, { requiredNamespaces: { unknown: { chains: ['unknown:1'], methods: [], events: [] } } }, { requiredNamespaces: { eip155: { chains: ['eip155:999'], methods: [], events: [] } } }])('rejects expired or unsupported proposals (%j)', async overrides => {
    const request = proposal(overrides); expect(await call('pri(walletConnect.session.approve)', { id: 'proposal', accounts: ['alice'] })).toMatchObject({ status: false }); expect(request.reject).toHaveBeenCalledOnce(); expect(state.walletConnectService.approveSession).not.toHaveBeenCalled();
  });
  it('keeps approval pending when relay approval fails', async () => {
    const request = proposal(); state.walletConnectService.approveSession.mockRejectedValueOnce(new Error('relay offline'));
    expect(await call('pri(walletConnect.session.approve)', { id: 'proposal', accounts: ['alice'] })).toEqual({ status: false, message: 'relay offline', title: '' }); expect(request.resolve).not.toHaveBeenCalled();
  });
  it.each([false, true])('rejects a user-denied session, expiry=%s', async expired => {
    const request = proposal(expired ? { expiry: 1 } : {}); expect(await call('pri(walletConnect.session.reject)', { id: 'proposal' })).toBe(true); expect(request.reject).toHaveBeenCalledOnce();
    expect(state.walletConnectService.rejectSession).toHaveBeenCalledTimes(expired ? 0 : 1);
  });
  it('disconnects a selected session and rejects unsupported requests', async () => {
    expect(await call('pri(walletConnect.session.disconnect)', { topic: 'public-session' })).toBe(true); expect(state.walletConnectService.disconnect).toHaveBeenCalledWith('public-session');
    const reject = vi.fn(); state.requestService.getNotSupportWCRequest.mockReturnValue({ reject }); expect(await call('pri(walletConnect.notSupport.reject)', { id: 'unsupported' })).toBe(true); expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'USER_REJECTED' }));
  });
});
