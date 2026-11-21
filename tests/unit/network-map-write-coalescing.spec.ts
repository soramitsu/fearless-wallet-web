import axios from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { NETWORK_STATUS_WRITE_DELAY_MS, NetworkService } from '@extension-base/services/network-service';
import KeyringStore from '@extension-base/stores/KeyringStore';
import NetworkMapStore from '@extension-base/stores/NetworkMap';

const io = vi.hoisted(() => ({ data: {} as Record<string, unknown>, writes: [] as string[][], hold: false,
  held: [] as Array<() => void> }));
vi.mock('@/consts/global', async (original) => ({ ...await original<object>(), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { lastError: undefined }, storage: { local: {
    get(keys: string[] | null, callback: (value: unknown) => void) {
      callback(structuredClone(keys ? Object.fromEntries(keys.map((key) => [key, io.data[key]])) : io.data));
    },
    set(items: Record<string, unknown>, callback: () => void) {
      const snapshot = structuredClone(items);
      const finish = () => { io.writes.push(Object.keys(snapshot)); Object.assign(io.data, snapshot); callback(); };
      if (io.hold) io.held.push(finish); else finish();
    },
  } },
} }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const NETWORK_MAP = 'fwnetworkMap:NetworkMap';
const networkMapWrites = () => io.writes.filter((keys) => keys.includes(NETWORK_MAP)).length;
const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);

beforeEach(() => {
  io.data = {}; io.writes = []; io.hold = false; io.held = [];
  vi.mocked(axios.get).mockReset().mockRejectedValue(new Error('offline'));
});
afterEach(() => {
  io.hold = false;
  io.held.splice(0).forEach((finish) => finish());
  vi.useRealTimers();
});

it('writes the network map once for the status changes made within the write delay', async () => {
  const service = create();
  await service.initNetworkMap();
  vi.useFakeTimers();
  const published = vi.fn();
  service.networkMapStore.getSubject().subscribe(published);
  io.writes = [];

  service.updateNetworkStatus('Bitcoin', NETWORK_STATUS.CONNECTING);
  service.updateNetworkStatus('Solana', NETWORK_STATUS.CONNECTING);
  await vi.advanceTimersByTimeAsync(NETWORK_STATUS_WRITE_DELAY_MS / 2);
  service.updateNetworkStatus('Bitcoin', NETWORK_STATUS.CONNECTED);
  await vi.advanceTimersByTimeAsync(NETWORK_STATUS_WRITE_DELAY_MS);

  expect(networkMapWrites()).toBe(1);
  expect(published).toHaveBeenCalledOnce();
  const saved = io.data[NETWORK_MAP] as Record<string, { networkStatus?: string }>;
  expect(saved.Bitcoin.networkStatus).toBe(NETWORK_STATUS.CONNECTED);
  expect(saved.Solana.networkStatus).toBe(NETWORK_STATUS.CONNECTING);
});

it('keeps a node choice saved while a status write waits', async () => {
  const service = create();
  await service.initNetworkMap();
  vi.useFakeTimers();

  service.updateNetworkStatus('Bitcoin', NETWORK_STATUS.CONNECTED);
  const edit = { ...service.networkMap.Bitcoin, currentProvider: 'https://personal.invalid', isManual: true,
    customNodes: [{ name: 'Personal', url: 'https://personal.invalid' }] };
  await service.upsertNetworkMap(edit);
  // Saved at once, before the delayed status write.
  expect((io.data[NETWORK_MAP] as Record<string, { currentProvider: string }>).Bitcoin.currentProvider)
    .toBe('https://personal.invalid');
  await vi.advanceTimersByTimeAsync(NETWORK_STATUS_WRITE_DELAY_MS);

  expect((io.data[NETWORK_MAP] as Record<string, unknown>).Bitcoin).toMatchObject({
    currentProvider: 'https://personal.invalid', isManual: true, networkStatus: NETWORK_STATUS.CONNECTED,
  });
});

it('reads another store without waiting for a network map write, and the network map after it', async () => {
  io.data['fw:keyring'] = { passwordHash: 'stored verifier' };
  const networkMap = new NetworkMapStore();
  io.hold = true;
  const write = networkMap.setAndWait('NetworkMap', { Bitcoin: { name: 'Bitcoin' } } as never);
  const networkRead = vi.fn();
  void networkMap.getAndWait('NetworkMap').then(networkRead);

  await expect(new KeyringStore().getAndWait()).resolves.toEqual({ passwordHash: 'stored verifier' });
  expect(networkRead).not.toHaveBeenCalled();

  io.held.splice(0).forEach((finish) => finish());
  await write;
  await vi.waitFor(() => expect(networkRead).toHaveBeenCalledWith({ Bitcoin: { name: 'Bitcoin' } }));
});
