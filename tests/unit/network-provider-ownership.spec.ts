import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

const io = vi.hoisted(() => ({ apis: [] as Array<{ emit(event: string): void; disconnect: ReturnType<typeof vi.fn> }> }));
vi.mock('@polkadot/api', () => ({ ApiPromise: class {
  isReadyOrError = new Promise(() => {});
  listeners = new Map<string, () => void>();
  disconnect = vi.fn().mockResolvedValue(undefined);
  constructor() { io.apis.push(this); }
  on(event: string, callback: () => void) { this.listeners.set(event, callback); }
  emit(event: string) { this.listeners.get(event)?.(); }
} }));
vi.mock('@polkadot/rpc-provider', () => ({ WsProvider: class { disconnect = vi.fn().mockResolvedValue(undefined); } }));
vi.mock('@extension-base/services/network-service/handlers/SoraApiHandler', () => ({ SoraApiHandler: class {} }));

describe('replaced Substrate provider ownership', () => {
  beforeEach(() => { io.apis = []; });
  const setup = async () => {
    const network = { ...readSnapshot().find(({ name }) => name === 'Polkadot')!, isManual: true, currentProvider: 'wss://original.invalid' };
    const state = { currentAccount: { address: 'public-owner' },
      subscriptionService: { subscribeSubstrateBalances: vi.fn(), cancelNetworkSubscription: vi.fn() },
      balanceService: { updateUtilityED: vi.fn() } };
    const service = { getNetworkJson: () => network, networkMap: { Polkadot: network }, disableNetworkMap: vi.fn() };
    const handler = new SubstrateApiHandler(service as never, state as never);
    await handler.initApi(network);
    return { handler, state, service, network };
  };

  it('ignores connected and ready callbacks from a replaced connection', async () => {
    const { handler, network, state } = await setup();
    const original = io.apis[0]; await handler.initApi({ ...network, currentProvider: 'wss://replacement.invalid' });
    handler.api.polkadot.apiStatus = NETWORK_STATUS.CONNECTING;
    original.emit('connected'); original.emit('ready');
    await Promise.resolve();
    expect(handler.api.polkadot.apiStatus).toBe(NETWORK_STATUS.CONNECTING);
    expect(state.subscriptionService.subscribeSubstrateBalances).not.toHaveBeenCalled();
  });

  it('does not remove or retry a newer connection when an older disconnect completes', async () => {
    const { handler, network, service } = await setup();
    let release!: () => void;
    io.apis[0].disconnect.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    handler.api.polkadot.apiRetry = MAX_CONTINUE_RETRY - 1;
    io.apis[0].emit('disconnected');
    expect(io.apis[0].disconnect).toHaveBeenCalledOnce();
    await handler.initApi({ ...network, currentProvider: 'wss://replacement.invalid' });
    const replacement = handler.api.polkadot.api;
    release(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler.api.polkadot.api).toBe(replacement);
    expect(io.apis).toHaveLength(2);
    expect(service.disableNetworkMap).not.toHaveBeenCalled();
  });

  it('can reactivate automatic selection after a previous connection exhausted its node list', async () => {
    const { handler, network } = await setup();
    handler.api.polkadot.nodeIndex = network.nodes.length;
    await expect(handler.initApi({ ...network, isManual: false })).resolves.toBeUndefined();
    expect(io.apis).toHaveLength(2);
  });
});
