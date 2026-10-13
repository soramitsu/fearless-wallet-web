import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { readSnapshot } from '../fixtures/legacy-305/generate';

const io = vi.hoisted(() => ({ data: {} as Record<string, unknown>, error: undefined as { message: string } | undefined,
  failRead: false, failWrite: false, hold: false, acknowledgements: [] as Array<() => void> }));
vi.mock('@/consts/global', async (original) => ({ ...await original<object>(), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { get lastError() { return io.error; } }, storage: { local: {
    get(keys: string[] | null, callback: (value: unknown) => void) {
      io.error = io.failRead ? { message: 'read unavailable' } : undefined;
      callback(structuredClone(keys ? Object.fromEntries(keys.map((key) => [key, io.data[key]])) : io.data));
      io.error = undefined;
    },
    set(items: Record<string, unknown>, callback: () => void) {
      const snapshot = structuredClone(items);
      const finish = () => {
        io.error = io.failWrite ? { message: 'write unavailable' } : undefined;
        if (!io.error) Object.assign(io.data, snapshot);
        callback(); io.error = undefined;
      };
      if (io.hold) io.acknowledgements.push(finish); else finish();
    },
  } },
} }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
const edit = (service: NetworkService) => ({ ...service.networkMap.Bitcoin, currentProvider: 'https://personal.invalid',
  isManual: true, customNodes: [{ name: 'Personal', url: 'https://personal.invalid' }] });

describe('actual network preference storage queue', () => {
  beforeEach(() => {
    io.data = {}; io.failRead = false; io.failWrite = false; io.hold = false; io.acknowledgements = [];
    vi.mocked(axios.get).mockReset().mockRejectedValue(new Error('offline'));
  });
  afterEach(async () => {
    io.hold = false;
    for (const finish of io.acknowledgements.splice(0)) finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('serializes a held user edit with status writes without rolling the committed preference back', async () => {
    const service = create(); await service.initNetworkMap();
    const published = vi.fn(); service.networkMapStore.getSubject().subscribe(published);
    io.hold = true;
    const pending = service.upsertNetworkMap(edit(service));
    await vi.waitFor(() => expect(io.acknowledgements).toHaveLength(1));
    service.updateNetworkStatus('Bitcoin', NETWORK_STATUS.CONNECTED);
    expect(service.networkMap.Bitcoin.currentProvider).not.toBe('https://personal.invalid');
    expect(published).not.toHaveBeenCalled();
    io.hold = false; io.acknowledgements.shift()!(); await pending;
    const saved = await service.networkMapStore.getAndWait('NetworkMap');
    expect(saved?.Bitcoin).toMatchObject({ currentProvider: 'https://personal.invalid', isManual: true });
    expect(service.networkMap.Bitcoin.currentProvider).toBe('https://personal.invalid');
  });

  it('propagates actual storage failure and publishes only the successful retry', async () => {
    const service = create(); await service.initNetworkMap();
    const published = vi.fn(); service.networkMapStore.getSubject().subscribe(published);
    io.failWrite = true;
    await expect(service.upsertNetworkMap(edit(service))).rejects.toThrow('write unavailable');
    expect(published).not.toHaveBeenCalled();
    expect(service.networkMap.Bitcoin.currentProvider).not.toBe('https://personal.invalid');
    io.failWrite = false;
    await service.upsertNetworkMap(edit(service));
    expect(published).toHaveBeenCalledOnce();
  });

  it('retains an acknowledged edit when a recovered-cache registry request completes later', async () => {
    io.failRead = true;
    const service = create(); await service.initNetworkMap();
    io.failRead = false;
    await service.networkMapStore.setAndWait('NetworkMap', { Bitcoin: { ...service.networkMap.Bitcoin, favorite: ['old-owner'] } });
    let release!: (value: unknown) => void;
    vi.mocked(axios.get).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const refresh = service.initNetworkMap();
    await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    await service.upsertNetworkMap(edit(service));
    release({ data: [readSnapshot().find(({ name }) => name === 'Polkadot')] });
    await refresh;
    expect(service.networkMap.Bitcoin).toMatchObject({ currentProvider: 'https://personal.invalid', favorite: ['old-owner'] });
    expect((await service.networkMapStore.getAndWait('NetworkMap'))?.Bitcoin.currentProvider).toBe('https://personal.invalid');
  });

  it('merges favorite changes for different owners through the actual read-modify-write queue', async () => {
    const service = create(); await service.initNetworkMap();
    await Promise.all([service.toggleFavoriteNetwork('Bitcoin', 'owner-a'), service.toggleFavoriteNetwork('Bitcoin', 'owner-b')]);
    expect((await service.networkMapStore.getAndWait('NetworkMap'))?.Bitcoin.favorite).toEqual(['owner-a', 'owner-b']);
    expect(service.networkMap.Bitcoin.favorite).toEqual(['owner-a', 'owner-b']);
  });
});
