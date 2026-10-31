import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import State from '@extension-base/background/handlers/State';
import { EXTENSION_ID } from '@extension-base/const';
import { WalletEcosystem } from '@/interfaces';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
const boundary = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), metadata: vi.fn() }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: { alice: {}, bob: {} } } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', async () => await import('@extension-base/services/asset-discovery-service'));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: boundary.get, set: boundary.set } }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: boundary.metadata }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
  const polkadot = { name: 'Polkadot', ecosystem: WalletEcosystem.Substrate, chainId: 'polkadot', addressPrefix: 0, active: true, favorite: ['alice'], rank: 1 };
  const ethereum = { name: 'Ethereum', ecosystem: 'ethereum', chainId: '1', active: true, favorite: [] };
  const networks = [polkadot, ethereum];
  const handler = () => ({ api: {}, getApi: vi.fn(), initApi: vi.fn().mockResolvedValue(undefined), initEvmApi: vi.fn(), destroyApi: vi.fn().mockResolvedValue(undefined) });
  const state = Object.setPrototypeOf({
    ready: false, tabStatusRevision: 0, currentAccount: { address: 'alice', ethereumAddress: '0x' + '11'.repeat(20) }, injectedProviders: new Map(), providers: {}, serviceInfoSubject: new Subject(),
    keyringService: { getAllMainAccounts: vi.fn(() => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }]), encodeAddress: vi.fn((value: string) => `encoded-${value}`) },
    networkService: { networkMap: Object.fromEntries(networks.map(n => [n.name, n])), networkValues: networks, networksGithub: networks, selectedNetworks: {}, getApiMap: {}, substrateApiHandler: handler(), evmApiHandler: handler(), tonApiHandler: handler(),
      getActiveNetworks: vi.fn(() => [polkadot]), initNetworkMap: vi.fn().mockResolvedValue(undefined), initNetworkApis: vi.fn(), destroyApi: vi.fn(), updateNetworkStore: vi.fn(), saveSelectedNetworks: vi.fn(), disableNetworkMap: vi.fn(), toggleFavoriteNetwork: vi.fn() },
    requestService: { getAuthList: vi.fn().mockResolvedValue({}), getAuthorize: vi.fn().mockResolvedValue(undefined), authSubject: new Subject(), saveMetadata: vi.fn(), authRequestHandler: { getEvmAuthorizationSnapshot: vi.fn() } },
    balanceService: { generateDefaultBalance: vi.fn(), hydrateBalanceStorage: vi.fn().mockResolvedValue(undefined), ...Object.fromEntries(['solana','bitcoin','iroha','ton','evm','substrate'].map(name => [`${name}BalanceService`, { fetchBalance: vi.fn().mockResolvedValue(undefined) }])) },
    actionCapabilityService: { init: vi.fn().mockResolvedValue(undefined) }, sendKillSwitchService: { init: vi.fn().mockResolvedValue(undefined) }, soraDisclaimerService: { init: vi.fn().mockResolvedValue(undefined) },
    eventService: { waitCryptoReady: Promise.resolve() }, scamService: { refreshScamAddressList: vi.fn() }, subscriptionService: { start: vi.fn() }, cronService: { start: vi.fn() }, assetDiscoverySweepService: { runIfDue: vi.fn().mockResolvedValue(undefined) },
  }, State.prototype) as Record<string, any>;
  // Model the handler's installed API identity so cleanup assertions concern an owned provider.
  const evmHandler = state.networkService.evmApiHandler;
  evmHandler.getApi.mockImplementation((name: string) => evmHandler.api[name.toLowerCase()]);
  evmHandler.initEvmApi.mockImplementation((network: { name: string }) => {
    evmHandler.api[network.name.toLowerCase()] = { api: { destroy: vi.fn() } };
  });
  return { state, polkadot, ethereum };
}
beforeEach(() => { vi.clearAllMocks(); boundary.get.mockResolvedValue({}); boundary.set.mockResolvedValue(undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('background state startup and network selection', () => {
  it('waits for crypto, network policy and stored balances before publishing readiness', async () => {
    const { state } = fixture(); const crypto = deferred<void>(), balances = deferred<void>();
    state.eventService.waitCryptoReady = crypto.promise;
    state.balanceService.hydrateBalanceStorage.mockReturnValueOnce(balances.promise);
    const published = vi.fn(); state.serviceInfoSubject.subscribe(published);
    const starting = state.init(); expect(state.networkService.initNetworkMap).not.toHaveBeenCalled();
    crypto.resolve(); await settle(); expect(state.balanceService.generateDefaultBalance).toHaveBeenCalledWith('alice', WalletEcosystem.Substrate);
    expect(state.isReady()).toBe(false); expect(state.networkService.initNetworkApis).not.toHaveBeenCalled();
    balances.resolve(); await starting;
    expect(state.isReady()).toBe(true); expect(state.subscriptionService.start).toHaveBeenCalledTimes(1); expect(state.cronService.start).toHaveBeenCalledTimes(1);
    expect(published).toHaveBeenCalledWith(expect.objectContaining({ currentAccountInfo: state.currentAccount, networkMap: state.networkService.networkMap }));
    expect(state.assetDiscoverySweepService.runIfDue).toHaveBeenCalledTimes(1);
  });
  it('does not mark the app ready if restoring balances fails', async () => {
    const { state } = fixture(); state.balanceService.hydrateBalanceStorage.mockRejectedValueOnce(new Error('storage'));
    await expect(state.init()).rejects.toThrow('storage'); expect(state.isReady()).toBe(false); expect(state.subscriptionService.start).not.toHaveBeenCalled();
  });
  it('loads persisted provider selections and leaves defaults intact for missing keys', async () => {
    const { state } = fixture(); const providers = { public: { meta: { name: 'Public' } } };
    boundary.get.mockResolvedValueOnce({ injectedProviders: [['port', 'provider']], providers });
    await state.injectFromStorage(); expect(state.injectedProviders.get('port')).toBe('provider'); expect(state.providers).toBe(providers);
    await state.injectFromStorage(); expect(state.providers).toBe(providers);
    expect(state.getAllAddresses()).toEqual(['alice', 'bob']); expect(state.getAddressList(true)).toEqual({ alice: true, bob: true });
    expect(state.getAccountAddress()).toBe('alice'); expect(state.authSubject).toBe(state.requestService.authSubject);
  });
  it.each([[ALL_NETWORKS, ['Polkadot', 'Ethereum']], [POPULAR_NETWORKS, ['Polkadot']], [FAVORITE_NETWORKS, ['Polkadot']], ['Ethereum', ['Ethereum']], ['absent', []]])('selects the exact networks for %s', (selection, expected) => {
    const { state } = fixture(); state.networkService.selectedNetworks.alice = selection;
    expect([...state.getActiveNetworksCurrentWallet('alice')].map(n => n.name)).toEqual(expected);
  });
  it('deactivates unused connections, persists selection and only initializes APIs after readiness', async () => {
    const { state, ethereum } = fixture(); const publish = vi.fn(); state.serviceInfoSubject.subscribe(publish);
    await state.setActiveNetworks(POPULAR_NETWORKS);
    expect(ethereum.active).toBe(false); expect(state.networkService.destroyApi).toHaveBeenCalledWith('Ethereum');
    expect(state.networkService.initNetworkApis).not.toHaveBeenCalled(); expect(state.networkService.saveSelectedNetworks).toHaveBeenCalledTimes(1);
    await state.setActiveNetworks(POPULAR_NETWORKS); expect(state.networkService.saveSelectedNetworks).toHaveBeenCalledTimes(1);
    state.ready = true; await state.setActiveNetworks(ALL_NETWORKS); expect(state.networkService.initNetworkApis).toHaveBeenCalledTimes(1); expect(publish).toHaveBeenCalledTimes(2);
    state.currentAccount = null; await state.setActiveNetworks('Ethereum'); expect(state.networkService.saveSelectedNetworks).toHaveBeenCalledTimes(2);
  });
  it('forwards metadata to both storage and the chain registry', () => {
    const { state } = fixture(); const metadata = { chain: 'Public test' } as never;
    state.saveMetadata(metadata); expect(state.requestService.saveMetadata).toHaveBeenCalledWith(metadata); expect(boundary.metadata).toHaveBeenCalledWith(metadata);
    state.disableNetworkMap('Polkadot'); expect(state.networkService.disableNetworkMap).toHaveBeenCalledWith('Polkadot');
  });
});

describe('active tab authorization status', () => {
  it('uses the exact origin, counts allowed accounts, and ignores stale tab callbacks', async () => {
    const { state } = fixture(); const callbacks: any[] = [];
    state.requestService.getAuthorize.mockImplementation(async callback => { callbacks.push(callback); });
    state.updateCurrentTabsUrl([{ url: 'https://one.example/path' } as chrome.tabs.Tab]);
    state.updateCurrentTabsUrl([{ url: 'https://two.example/path' } as chrome.tabs.Tab]);
    callbacks[1]({ 'https://two.example': { isAllowed: true, authorizedAccounts: ['alice'] } });
    callbacks[0]({ 'https://one.example': { isAllowed: true, authorizedAccounts: ['alice', 'bob'] } });
    expect(state.currentTabStatus).toEqual({ isAuthorize: true, authorizeAccountsCount: 1, dAppName: 'two.example' });
    state.updateCurrentTabsUrl([]);
    callbacks[1]({ 'https://two.example': { isAllowed: true, authorizedAccounts: ['alice'] } });
    expect(state.currentTabStatus).toEqual({ isAuthorize: false, authorizeAccountsCount: 0, dAppName: '' });
  });
  it.each(['chrome://extensions', 'about:blank', 'not a URL', 'https://user:password@example.com'])('tolerates browser-internal and invalid tab URL %s', url => {
    const { state } = fixture(); expect(() => state.updateCurrentTabsUrl([{ url } as chrome.tabs.Tab])).not.toThrow();
    expect(state.currentTabStatus).toEqual({ isAuthorize: false, authorizeAccountsCount: 0, dAppName: '' });
    expect(state.requestService.getAuthorize).not.toHaveBeenCalled();
  });
  it('labels its own extension page and fails closed when authorization storage rejects', async () => {
    const { state } = fixture(); state.requestService.getAuthorize.mockRejectedValue(new Error('offline'));
    state.updateCurrentTabsUrl([{ url: `chrome-extension://${EXTENSION_ID}/popup.html` } as chrome.tabs.Tab]); await settle();
    expect(state.currentTabStatus).toMatchObject({ isAuthorize: false, dAppName: 'header.currentExtensionPage' });
    state.updateCurrentTabsUrl([{ url: 'https://example.com/' } as chrome.tabs.Tab]); await settle();
    expect(state.currentTabStatus).toMatchObject({ isAuthorize: false, authorizeAccountsCount: 0, dAppName: 'example.com' });
  });
});

describe('per-port RPC providers', () => {
  it('requires a provider before RPC operations', () => {
    const { state } = fixture(); const port = {} as never;
    expect(() => state.rpcSend({ method: 'chain_getHeader', params: [] }, port)).toThrow('before provider is set');
    expect(() => state.rpcSubscribe({ method: 'chain_subscribeNewHeads', params: [], type: 'heads' }, vi.fn(), port)).toThrow('before provider is set');
    expect(() => state.rpcUnsubscribe({ method: 'chain_unsubscribeNewHeads', type: 'heads', subscriptionId: 1 }, port)).toThrow('before provider is set');
    expect(() => state.rpcSubscribeConnected(null, vi.fn(), port)).toThrow('before provider is set');
    expect(() => state.rpcStartProvider('missing', port)).toThrow('not exposed');
  });
  it('routes requests and subscriptions to a single provider and disconnects it with the port', async () => {
    const { state } = fixture(); let disconnect!: () => void;
    const port = { onDisconnect: { addListener: vi.fn(callback => { disconnect = callback; }) } } as never;
    const provider = { send: vi.fn().mockResolvedValue('header'), subscribe: vi.fn().mockResolvedValue(9), unsubscribe: vi.fn().mockResolvedValue(true), disconnect: vi.fn().mockResolvedValue(undefined), on: vi.fn(), isConnected: true };
    const meta = { name: 'Public RPC' }; const start = vi.fn(() => provider); state.providers.public = { meta, start } as never;
    expect(state.rpcListProviders()).toEqual({ public: meta }); expect(state.rpcStartProvider('public', port)).toBe(meta); state.rpcStartProvider('public', port); expect(start).toHaveBeenCalledTimes(1);
    expect(await state.rpcSend({ method: 'chain_getHeader', params: [] }, port)).toBe('header');
    const cb = vi.fn(); expect(await state.rpcSubscribe({ method: 'heads', params: [1], type: 'chain' }, cb, port)).toBe(9);
    expect(provider.subscribe).toHaveBeenCalledWith('chain', 'heads', [1], cb);
    expect(await state.rpcUnsubscribe({ method: 'unheads', type: 'chain', subscriptionId: 9 }, port)).toBe(true);
    state.rpcSubscribeConnected(null, cb, port); expect(cb).toHaveBeenLastCalledWith(null, true);
    provider.on.mock.calls.find(([event]) => event === 'disconnected')![1](); expect(cb).toHaveBeenLastCalledWith(null, false);
    provider.on.mock.calls.find(([event]) => event === 'connected')![1](); expect(cb).toHaveBeenLastCalledWith(null, true);
    disconnect(); await settle(); expect(provider.disconnect).toHaveBeenCalledTimes(1); expect(state.injectedProviders.has(port)).toBe(false);
  });
});

describe('discovery temporary connections', () => {
  it.each([false, true])('cleans up an inactive EVM API after discovery, including rejection=%s', async fails => {
    const { state, ethereum } = fixture(); ethereum.active = false;
    state.keyringService.getAllMainAccounts.mockReturnValue([{ address: 'owner', meta: { walletEcosystem: WalletEcosystem.Evm, ethereumAddress: '0x' + '11'.repeat(20) } }]);
    if (fails) state.balanceService.evmBalanceService.fetchBalance.mockRejectedValueOnce(new Error('RPC failed'));
    const scan = state.scanDiscoveryNetwork(ethereum);
    if (fails) await expect(scan).rejects.toThrow('RPC failed'); else await scan;
    expect(state.networkService.evmApiHandler.initEvmApi).toHaveBeenCalledWith(ethereum);
    expect(state.networkService.evmApiHandler.destroyApi).toHaveBeenCalledWith('Ethereum');
  });
  it.each([false, true])('cleans up a temporary Substrate API and readiness timeout, rejection=%s', async fails => {
    vi.useFakeTimers(); const { state, polkadot } = fixture(); polkadot.active = false;
    state.networkService.substrateApiHandler.api.polkadot = { api: { isReady: Promise.resolve() } };
    if (fails) state.balanceService.substrateBalanceService.fetchBalance.mockRejectedValueOnce(new Error('RPC failed'));
    const scan = state.scanDiscoveryNetwork(polkadot);
    if (fails) await expect(scan).rejects.toThrow('RPC failed'); else await scan;
    expect(state.networkService.substrateApiHandler.destroyApi).toHaveBeenCalledWith('Polkadot');
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([WalletEcosystem.Solana, WalletEcosystem.Bitcoin, WalletEcosystem.Iroha, WalletEcosystem.Ton])('routes %s discovery to the matching balance service', async ecosystem => {
    const { state } = fixture(); const network = { name: 'Network', ecosystem, chainId: 'chain', active: false };
    state.networkService.networkMap.Network = network;
    state.keyringService.getAllMainAccounts.mockReturnValue([{ address: 'owner', meta: { walletEcosystem: ecosystem, solanaAddress: 'sol', bitcoinAddress: 'btc', bitcoinTestnetAddress: 'testbtc', irohaAddress: 'iroha' } }]);
    await state.scanDiscoveryNetwork(network);
    expect(state.balanceService[`${ecosystem}BalanceService`].fetchBalance).toHaveBeenCalledTimes(1);
    if (ecosystem === WalletEcosystem.Ton) expect(state.networkService.tonApiHandler.initApi).toHaveBeenCalledWith(network);
  });
});

describe('discovery cleanup provider ownership', () => {
  const cases = ['ethereum', 'substrate'].flatMap(ecosystem =>
    ['activate', 'replace', 'activate-and-replace'].map(change => [ecosystem, change] as const));
  it.each(cases)('preserves current %s connection after failed discovery and %s', async (ecosystem, change) => {
    const { state, ethereum, polkadot } = fixture();
    const network = ecosystem === 'ethereum' ? ethereum : polkadot;
    const key = network.name.toLowerCase(); network.active = false;
    const handler = ecosystem === 'ethereum' ? state.networkService.evmApiHandler : state.networkService.substrateApiHandler;
    const oldApi = { isReady: Promise.resolve(), destroy: vi.fn(), disconnect: vi.fn() };
    handler.api[key] = { api: oldApi };
    if (ecosystem === 'ethereum') state.keyringService.getAllMainAccounts.mockReturnValue([
      { address: 'owner', meta: { walletEcosystem: WalletEcosystem.Evm, ethereumAddress: '0x' + '11'.repeat(20) } },
    ]);
    const release = deferred<void>();
    const fetch = state.balanceService[ecosystem === 'ethereum' ? 'evmBalanceService' : 'substrateBalanceService'].fetchBalance;
    fetch.mockImplementationOnce(async () => { await release.promise; throw new Error('public discovery failure'); });
    const outcome = state.scanDiscoveryNetwork(network).then(() => undefined, (error: Error) => error);
    await settle(); expect(fetch).toHaveBeenCalledOnce();
    const replacementApi = { isReady: Promise.resolve(), destroy: vi.fn(), disconnect: vi.fn() };
    if (change.includes('activate')) state.networkService.networkMap[network.name] = { ...network, active: true };
    if (change.includes('replace')) handler.api[key] = { api: replacementApi };
    release.resolve();
    expect(await outcome).toEqual(new Error('public discovery failure'));
    expect(handler.destroyApi).not.toHaveBeenCalled();
    expect(handler.api[key].api).toBe(change.includes('replace') ? replacementApi : oldApi);
  });
  it('does not claim a replacement Substrate API installed while initialization is completing', async () => {
    const { state, polkadot } = fixture(); polkadot.active = false;
    const handler = state.networkService.substrateApiHandler;
    const initializing = deferred<void>();
    const original = { isReady: Promise.resolve() }, replacement = { isReady: Promise.resolve() };
    handler.initApi.mockImplementationOnce(() => {
      handler.api.polkadot = { api: original };
      return initializing.promise;
    });
    state.balanceService.substrateBalanceService.fetchBalance.mockRejectedValueOnce(new Error('public fetch failure'));
    const outcome = state.scanDiscoveryNetwork(polkadot).then(() => undefined, (error: Error) => error);
    handler.api.polkadot = { api: replacement };
    initializing.resolve();
    expect(await outcome).toEqual(new Error('public fetch failure'));
    expect(handler.destroyApi).not.toHaveBeenCalled();
    expect(handler.api.polkadot.api).toBe(replacement);
  });
});
