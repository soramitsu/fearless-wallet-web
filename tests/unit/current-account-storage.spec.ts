import { api as apiSora } from '@sora-substrate/util';
import Provider from '@walletconnect/universal-provider';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import ExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { KeyringService } from '@extension-base/services/keyring-service';
import State from '@extension-base/background/handlers/State';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type { SessionTypes } from '@walletconnect/types';
import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { WalletEcosystem } from '@/interfaces';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, failWrite: false, failSelectionRollback: false, holdWrite: false, holdRead: false,
  reads: [] as (() => void)[],
  writes: [] as (() => void)[],
  runtime: { getURL: (path: string) => path, lastError: undefined as { message: string } | undefined },
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: { bridgeProxy: { sub: {} } } }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys, callback) => {
      const snapshot = structuredClone(fixture.data);
      if (fixture.holdRead) fixture.reads.push(() => callback(snapshot)); else callback(snapshot);
    },
    set: (data, callback) => {
      const snapshot = structuredClone(data);
      const finish = () => {
        const failed = fixture.failWrite || (fixture.failSelectionRollback && snapshot[key]?.address === first.address);
        fixture.runtime.lastError = failed ? { message: 'Public selection storage failure' } : undefined;
        if (!failed) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      };
      if (fixture.holdWrite) fixture.writes.push(finish); else finish();
    },
  } },
} }));

const key = 'fwcurrent_account:CurrentAccountInfo';
const first = { address: '0x' + '11'.repeat(32), name: 'Public first', ethereumAddress: '', isMobile: true, walletEcosystem: WalletEcosystem.Substrate };
const second = { ...first, address: '0x' + '22'.repeat(32), name: 'Public second' };
let service: KeyringService;
let pending: Promise<unknown>[];
const observe = (result: unknown) => {
  const outcome = Promise.resolve(result).then(() => 'resolved', () => 'rejected');
  pending.push(outcome);
  return outcome;
};
function createService(current: CurrentAccountState = structuredClone(first)) {
  const service = Object.create(KeyringService.prototype) as KeyringService;
  Object.assign(service, { currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(current), selectionRevision: 0 });
  return service;
}
beforeEach(() => {
  fixture.data = { [key]: structuredClone(first) };
  fixture.failWrite = false;
  fixture.failSelectionRollback = false;
  fixture.holdWrite = false;
  fixture.holdRead = false;
  fixture.writes = [];
  fixture.reads = [];
  pending = [];
  service = createService();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  fixture.failWrite = false;
  fixture.failSelectionRollback = false;
  fixture.holdWrite = false;
  fixture.holdRead = false;
  for (let i = 0; i < 8; i++) {
    fixture.reads.splice(0).forEach((finish) => finish());
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(pending);
  await service.settleCurrentAccount();
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('current account selection persistence', () => {
  it('publishes a changed selection only after storage acknowledgement', async () => {
    fixture.holdWrite = true;
    const result = observe(service.setCurrentAccount(second));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.currentAccountSubject.value).toEqual(first);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(service.currentAccountSubject.value).toEqual(second);
  });

  it('does not report completion before a submitted selection has been saved', async () => {
    fixture.holdWrite = true;
    let done = false;
    const result = observe(Promise.resolve(service.setCurrentAccount(second)).then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(fixture.data[key]).toEqual(second);
  });

  it('rejects failed selection storage without changing the published account, then permits retry', async () => {
    fixture.failWrite = true;
    expect(await observe(service.setCurrentAccount(second))).toBe('rejected');
    expect(service.currentAccountSubject.value).toEqual(first);
    expect(fixture.data[key]).toEqual(first);
    fixture.failWrite = false;
    await service.setCurrentAccount(second);
    const restarted = createService(null);
    await restarted.restoreCurrentAccount();
    expect(restarted.currentAccountSubject.value).toEqual(second);
  });

  it('waits for durable clearing before publishing no selected account', async () => {
    fixture.holdWrite = true;
    const result = observe(service.setCurrentAccount(null));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.currentAccountSubject.value).toEqual(first);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(fixture.data[key]).toBeNull();
    expect(service.currentAccountSubject.value).toBeNull();
  });

  it('captures a caller-independent selection before the queued write starts', async () => {
    const selected = structuredClone(second);
    const result = observe(service.setCurrentAccount(selected));
    selected.name = 'Mutated public caller';
    await result;
    await new CurrentAccountStore().getAndWait('CurrentAccountInfo');
    expect(fixture.data[key]).toEqual(second);
    expect(service.currentAccountSubject.value).toEqual(second);
  });

  it('restores an explicit persisted null over a stale live selection', async () => {
    fixture.data[key] = null;
    await service.restoreCurrentAccount();
    expect(service.currentAccountSubject.value).toBeNull();
  });

  it('does not restore an old selection over a choice requested during the read', async () => {
    service = createService(null);
    fixture.holdRead = true;
    fixture.holdWrite = true;
    const restored = observe(service.restoreCurrentAccount());
    await vi.waitFor(() => expect(fixture.reads).toHaveLength(1));
    const selected = observe(service.setCurrentAccount(second));
    fixture.holdRead = false;
    fixture.reads.shift()!();
    await restored;
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.currentAccountSubject.value).toBeNull();
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await selected).toBe('resolved');
    expect(service.currentAccountSubject.value).toEqual(second);
  });

  it('refuses malformed saved selection without publishing or overwriting it', async () => {
    fixture.data[key] = true;
    expect(await observe(service.restoreCurrentAccount())).toBe('rejected');
    expect(service.currentAccountSubject.value).toEqual(first);
    expect(fixture.data[key]).toBe(true);
  });

  it('defers State selection side effects and caller callback until storage acknowledgement', async () => {
    const state = { keyringService: service, poolsService: { unsubscribePools: vi.fn() }, updateServiceInfo: vi.fn() };
    const callback = vi.fn();
    fixture.holdWrite = true;
    const result = observe(State.prototype.setCurrentAccount.call(state as unknown as State, second, callback));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(callback).not.toHaveBeenCalled();
    expect(state.poolsService.unsubscribePools).not.toHaveBeenCalled();
    expect(state.updateServiceInfo).not.toHaveBeenCalled();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(callback).toHaveBeenCalledOnce();
    expect(state.updateServiceInfo).toHaveBeenCalledOnce();
  });
});

function selectionState() {
  const state = Object.create(State.prototype) as State;
  Object.assign(service, {
    getAccount: () => ({ meta: second }),
    triggerWalletsSubscription: vi.fn(),
  });
  Object.assign(state, {
    keyringService: service,
    balanceService: { generateDefaultBalance: vi.fn() },
    poolsService: { unsubscribePools: vi.fn() },
    networkService: { selectedNetworks: {} },
    nftService: { publishNfts: vi.fn() },
    setActiveNetworks: vi.fn(),
    updateServiceInfo: vi.fn(),
    ready: false,
  });
  state.setCurrentAccount = (...args) => {
    const result = State.prototype.setCurrentAccount.apply(state, args);
    pending.push(Promise.resolve(result).catch(() => undefined));
    return result;
  };
  return state;
}

describe('actual selection request acknowledgement', () => {
  it('does not return successful account switching while selection storage is pending', async () => {
    const state = selectionState();
    fixture.holdWrite = true;
    let done = false;
    const result = observe(Promise.resolve(state.updateCurrentAccount({ address: second.address })).then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(state.currentAccount).toEqual(first);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(state.currentAccount?.address).toBe(second.address);
    expect(state.nftService.publishNfts).toHaveBeenCalledOnce();
  });

  it('propagates selection failure to the switching caller without publishing side effects', async () => {
    const state = selectionState();
    fixture.failWrite = true;
    expect(await observe(state.updateCurrentAccount({ address: second.address }))).toBe('rejected');
    expect(state.currentAccount).toEqual(first);
    expect(state.nftService.publishNfts).not.toHaveBeenCalled();
    expect(service.triggerWalletsSubscription).not.toHaveBeenCalled();
  });
});


describe('selected metadata isolation', () => {
  const ethereumAddress = '0x' + '33'.repeat(20);
  function metadataHandler() {
    const state = selectionState();
    Object.assign(state.networkService, { networkMap: {}, evmApiHandler: { refreshEvmApi: vi.fn() } });
    Object.assign(service, { saveAccountMeta: vi.fn(async () => undefined) });
    return { state, extension: new ExtensionBase(state) };
  }

  it('does not copy another account EVM metadata into the selected wallet', async () => {
    const { state, extension } = metadataHandler();
    await extension.updatePairMeta({ address: second.address, meta: { ethereumAddress } });
    expect(state.currentAccount).toEqual(first);
    expect(fixture.data[key]).toEqual(first);
  });

  it('does not apply a completed metadata update to a wallet selected during its wait', async () => {
    const { state, extension } = metadataHandler();
    let finish!: () => void;
    vi.mocked(service.saveAccountMeta).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const result = observe(extension.updatePairMeta({ address: first.address, meta: { ethereumAddress } }));
    await service.setCurrentAccount(second);
    finish();
    expect(await result).toBe('resolved');
    expect(state.currentAccount).toEqual(second);
    expect(fixture.data[key]).toEqual(second);
  });
  it('does not queue a stale metadata selection behind an already pending user choice', async () => {
    const { state, extension } = metadataHandler();
    fixture.holdWrite = true;
    const selected = observe(service.setCurrentAccount(second));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    const updated = observe(extension.updatePairMeta({ address: first.address, meta: { ethereumAddress } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await selected).toBe('resolved');
    await updated;
    expect(state.currentAccount).toEqual(second);
    expect(fixture.data[key]).toEqual(second);
  });

});


describe('selection races through actual mobile pairing', () => {
  async function pairing() {
    const state = selectionState();
    const topic = 'public-selection-race';
    const address = '0x' + '44'.repeat(32);
    const session = {
      topic, acknowledged: true, expiry: Math.floor(Date.now() / 1000) + 600,
      peer: { publicKey: 'public-peer', metadata: { name: 'Public mobile', url: 'https://public.example', icons: [], description: '' } },
      namespaces: { polkadot: { methods: ['polkadot_signMessage', 'polkadot_signTransaction'], accounts: [`polkadot:${'11'.repeat(16)}:${address}`], events: [] } },
    } as unknown as SessionTypes.Struct;
    let approve!: (session: SessionTypes.Struct) => void;
    let sessions: SessionTypes.Struct[] = [];
    const approval = new Promise<SessionTypes.Struct>((resolve) => { approve = resolve; });
    const client = { on: vi.fn(), disconnect: vi.fn(async () => undefined),
      session: { get values() { return sessions; } },
      connect: vi.fn(async () => { sessions = [session]; return { uri: 'wc:public-selection-race', approval: () => approval }; }),
    };
    vi.spyOn(Provider, 'init').mockResolvedValue({ client } as unknown as Provider);
    const records: { address: string; meta: Record<string, unknown> }[] = [];
    Object.assign(service, {
      encodeAddress: (address: string) => address,
      getAllAccounts: () => records,
      getAddress: (address: string) => records.find((r) => r.address === address),
      getAccount: (address: string) => records.find((r) => r.address === address),
      saveAddress: vi.fn(async (address, meta, _type, options) => { options.assertCurrent(); records.push({ address, meta }); }),
    });
    const callback = vi.fn();
    const cancelSubscription = vi.fn();
    Object.assign(state, { subscriptionService: { createSubscription: () => callback, setUnsubscriptionHandle: vi.fn(), cancelSubscription } });
    Object.assign(state.networkService, { networkValues: [{ name: 'Public substrate', ecosystem: 'substrate', chainId: '11'.repeat(32) }] });
    const dapp = new WalletConnectDAppService(state);
    const uri = await dapp.initPairing('public-selection-race');
    await dapp.subscribePairing(uri, 'public-selection-subscription');
    fixture.holdWrite = true;
    approve(session);
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.saveAddress).toHaveBeenCalledOnce();
    expect(state.currentAccount).toEqual(first);
    expect(callback).not.toHaveBeenCalled();
    return { state, dapp, callback, topic, address };
  }

  it('waits for an in-flight selection and restores the previous choice before cancellation completes', async () => {
    const { state, dapp, callback } = await pairing();
    let cancelled = false;
    const result = observe(dapp.abortPairingAttempt('public-selection-race').then(() => { cancelled = true; }));
    expect(cancelled).toBe(false);
    expect(state.currentAccount).toEqual(first);
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(state.currentAccount).toEqual(first);
    expect(fixture.data[key]).toEqual(first);
    expect(callback).not.toHaveBeenCalledWith({ status: true });
  });

  it('does not roll back a newer explicit choice queued during cancelled mobile selection', async () => {
    const { state, dapp, callback } = await pairing();
    const cancelled = observe(dapp.abortPairingAttempt('public-selection-race'));
    const selected = observe(service.setCurrentAccount(second));
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await cancelled).toBe('resolved');
    expect(await selected).toBe('resolved');
    expect(state.currentAccount).toEqual(second);
    expect(fixture.data[key]).toEqual(second);
    expect(callback).not.toHaveBeenCalledWith({ status: true });
  });
  it('publishes pairing success only with the acknowledged selected wallet', async () => {
    const { state, callback, address, topic } = await pairing();
    expect(callback).not.toHaveBeenCalled();
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({ status: true }));
    expect(state.currentAccount).toMatchObject({ address, wcTopic: topic });
    expect(fixture.data[key]).toEqual(state.currentAccount);
  });

  it('requires compensation acknowledgement before cancellation reports completion', async () => {
    const { state, dapp, callback } = await pairing();
    let done = false;
    const cancelled = observe(dapp.abortPairingAttempt('public-selection-race').then(() => { done = true; }));
    // First acknowledge the provisional selection, then durable session retirement.
    fixture.writes.shift()!();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writes.shift()!();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(state.currentAccount).toEqual(first);
    expect(fixture.data[key]).not.toEqual(first);
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await cancelled).toBe('resolved');
    expect(fixture.data[key]).toEqual(first);
    expect(callback).not.toHaveBeenCalledWith({ status: true });
  });

  it('reports failed compensation, clears runtime selection and retries cancellation durably', async () => {
    const { state, dapp, callback, address } = await pairing();
    const oldSoraPair = { json: null, pair: { address: first.address } };
    Object.assign(apiSora, { account: oldSoraPair });
    Object.assign(apiSora.bridgeProxy.sub, { account: oldSoraPair });
    fixture.failSelectionRollback = true;
    const cancelled = observe(dapp.abortPairingAttempt('public-selection-race'));
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await cancelled).toBe('rejected');
    expect(state.currentAccount).toBeNull();
    expect(state.poolsService.unsubscribePools).toHaveBeenCalled();
    expect(state.updateServiceInfo).toHaveBeenCalled();
    expect((apiSora as unknown as { account: unknown }).account).toBeUndefined();
    expect((apiSora.bridgeProxy.sub as unknown as { account: unknown }).account).toBeUndefined();
    expect(fixture.data[key]).toMatchObject({ address });
    expect(callback).not.toHaveBeenCalledWith({ status: true });
    fixture.failSelectionRollback = false;
    expect(await dapp.abortPairingAttempt('public-selection-race')).toBe(true);
    expect(state.currentAccount).toEqual(first);
    expect(fixture.data[key]).toEqual(first);
  });

  it('does not publish a retired mobile selection when reconstructing from saved state', async () => {
    const topic = 'public-retired-before-restart';
    fixture.data[key] = { ...second, wcTopic: topic };
    fixture.data['fwWalletConnect:retiredTopics'] = { version: 1, topics: [topic] };
    const restarted = createService(null);
    fixture.holdWrite = true;
    const restored = observe(restarted.restoreCurrentAccount());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(restarted.currentAccountSubject.value).toBeNull();
    fixture.holdWrite = false;
    fixture.writes.shift()!();
    expect(await restored).toBe('resolved');
    expect(restarted.currentAccountSubject.value).toBeNull();
    expect(fixture.data[key]).toBeNull();
  });

  it('does not choose a retired mobile account as the startup fallback', async () => {
    const state = selectionState();
    const topic = 'public-retired-startup';
    fixture.data['fwWalletConnect:retiredTopics'] = { version: 1, topics: [topic] };
    Object.assign(service, { getAllMainAccounts: () => [{ address: second.address, meta: { ...second, wcTopic: topic } }] });
    service.currentAccountSubject.next(null);
    fixture.data[key] = null;
    await state.ensureCurrentAccount();
    expect(state.currentAccount).toBeNull();
    expect(fixture.data[key]).toBeNull();
  });

  it.each(['ensureCurrentAccount', 'onInstall'] as const)('does not overwrite a newer choice after %s waits for retirement storage', async (method) => {
    const state = selectionState();
    const accounts = [{ address: first.address, meta: { ...first, wcTopic: 'public-old-topic' } }];
    Object.assign(service, { getAllMainAccounts: () => accounts });
    service.currentAccountSubject.next(null);
    fixture.data[key] = null;
    fixture.holdRead = true;
    const started = observe(state[method]());
    await vi.waitFor(() => expect(fixture.reads).toHaveLength(1));
    accounts.push({ address: second.address, meta: { ...second, wcTopic: 'public-new-topic' } });
    const selected = observe(service.setCurrentAccount(second));
    fixture.holdRead = false;
    fixture.reads.shift()!();
    expect(await started).toBe('resolved');
    expect(await selected).toBe('resolved');
    expect(state.currentAccount).toEqual(second);
    expect(fixture.data[key]).toEqual(second);
  });

});
