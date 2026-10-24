import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api as apiSora } from '@sora-substrate/util';
import { SoraApiHandler } from '@extension-base/services/network-service/handlers/SoraApiHandler';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const io = vi.hoisted(() => ({ apis: [] as Array<{ isReady: Promise<void>; isReadyOrError: Promise<void>;
  resolve(): void; reject(error: Error): void; disconnect: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> }>,
  initialize: vi.fn(), fees: vi.fn(), feeValue: '17' }));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    isConnected = true;
    resolve!: () => void;
    reject!: (error: Error) => void;
    isReady = new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    isReadyOrError = this.isReady;
    disconnect = vi.fn().mockResolvedValue(undefined);
    off = vi.fn();
    on = vi.fn();
    constructor() { io.apis.push(this); }
  },
  WsProvider: class {},
}));
vi.mock('@sora-substrate/api', () => ({ options: () => ({}) }));
vi.mock('@sora-substrate/util', async () => {
  const { Connection } = await import('@sora-substrate/connection');
  const { ApiPromise, WsProvider } = await import('@polkadot/api');
  class Api {
    NetworkFee = { Transfer: '0' };
    setConnection = vi.fn();
    async initialize() { await io.initialize(); }
    async calcStaticNetworkFees() { await io.fees(); this.NetworkFee.Transfer = io.feeValue; }
  }
  return { Api, api: new Api(), connection: new Connection(ApiPromise, WsProvider, {}),
    FPNumber: { fromCodecValue: (value: string) => ({ toString: () => value }) } };
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = () => ({ soraFees: { next: vi.fn() }, currentAccount: undefined,
  subscriptionService: { subscribeSubstrateBalances: vi.fn() }, balanceService: { updateUtilityED: vi.fn() } });

describe('owned SORA initialization and endpoint replacement', () => {
  beforeEach(() => { vi.clearAllMocks(); io.apis = []; io.feeValue = '17'; io.initialize.mockResolvedValue(undefined); io.fees.mockResolvedValue(undefined); });

  it('returns initialization failure to the ready callback owner', async () => {
    SoraApiHandler.initApi('wss://ready.invalid', []); io.apis.at(-1)!.resolve(); await settle();
    const failure = Promise.reject(new Error('fee initialization unavailable'));
    void failure.catch(() => {});
    io.initialize.mockReturnValue(failure);
    const handler = new SubstrateApiHandler({} as never, state() as never);
    await expect(handler.onReady(SORA_NETWORK_NAME.toLowerCase())).rejects.toThrow('fee initialization unavailable');
  });

  it('does not publish fees after its ready callback loses connection ownership', async () => {
    SoraApiHandler.initApi('wss://owned.invalid', []); io.apis.at(-1)!.resolve(); await settle();
    let complete!: () => void;
    io.fees.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    let current = true;
    const owner = state();
    const pending = SoraApiHandler.initialize(owner as never, () => current);
    await vi.waitFor(() => expect(io.fees).toHaveBeenCalled());
    current = false; complete(); await pending;
    expect(owner.soraFees.next).not.toHaveBeenCalled();
  });

  it('disconnects a superseded pending endpoint without waiting for its readiness', async () => {
    SoraApiHandler.initApi('wss://pending.invalid', []);
    const previous = io.apis.at(-1)!;
    SoraApiHandler.initApi('wss://replacement.invalid', []);
    await settle();
    expect(previous.disconnect).toHaveBeenCalled();
    previous.resolve(); io.apis.at(-1)!.resolve(); await settle();
  });

  it('keeps the current endpoint when an older SDK open rejects and runs its cleanup', async () => {
    SoraApiHandler.initApi('wss://old.invalid', []);
    const previous = io.apis.at(-1)!;
    SoraApiHandler.initApi('wss://new.invalid', []);
    const current = io.apis.at(-1)!; current.resolve(); await settle();
    previous.reject(new Error('late old open failure')); await settle(); await settle();
    expect(SoraApiHandler.getApiInstance()).toBe(current);
    expect(current.disconnect).not.toHaveBeenCalled();
  });

  it('does not overwrite newer SDK fees when an old fee calculation completes late', async () => {
    SoraApiHandler.initApi('wss://old-fees.invalid', []); io.apis.at(-1)!.resolve(); await settle();
    let finishOld!: () => void;
    io.fees.mockReturnValueOnce(new Promise<void>((resolve) => { finishOld = resolve; }));
    const oldOwner = state(); const old = SoraApiHandler.initialize(oldOwner as never);
    await vi.waitFor(() => expect(io.fees).toHaveBeenCalledOnce());
    SoraApiHandler.initApi('wss://new-fees.invalid', []); io.apis.at(-1)!.resolve(); await settle();
    io.feeValue = '29'; const currentOwner = state(); await SoraApiHandler.initialize(currentOwner as never);
    io.feeValue = '17'; finishOld(); await old;
    expect(oldOwner.soraFees.next).not.toHaveBeenCalled();
    expect(currentOwner.soraFees.next).toHaveBeenCalledExactlyOnceWith({ Transfer: '29' });
    expect(apiSora.NetworkFee.Transfer).toBe('29');
  });

  it('does not subscribe balances after readiness ownership changes during initialization', async () => {
    let finish!: () => void;
    io.initialize.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const owner = { ...state(), currentAccount: { address: 'public-owner' } };
    const handler = new SubstrateApiHandler({} as never, owner as never);
    const network = { name: SORA_NETWORK_NAME, nodes: [{ name: 'Public', url: 'wss://ready-old.invalid' }], isManual: false };
    await handler.initApi(network as never); io.apis.at(-1)!.resolve(); await settle();
    const pending = handler.onReady(SORA_NETWORK_NAME.toLowerCase());
    await vi.waitFor(() => expect(io.initialize).toHaveBeenCalledOnce());
    await handler.initApi({ ...network, nodes: [{ name: 'New', url: 'wss://ready-new.invalid' }] } as never);
    io.apis.at(-1)!.resolve(); finish(); await pending;
    expect(owner.subscriptionService.subscribeSubstrateBalances).not.toHaveBeenCalled();
    expect(owner.soraFees.next).not.toHaveBeenCalled();
  });

  it('publishes successfully calculated current fees and preserves SDK fee access', async () => {
    SoraApiHandler.initApi('wss://healthy.invalid', []); io.apis.at(-1)!.resolve(); await settle();
    const owner = state(); await SoraApiHandler.initialize(owner as never, () => true);
    expect(owner.soraFees.next).toHaveBeenCalledExactlyOnceWith({ Transfer: '17' });
    expect(apiSora.NetworkFee.Transfer).toBe('17');
  });
});
