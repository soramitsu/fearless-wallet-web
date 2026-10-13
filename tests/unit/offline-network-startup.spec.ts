import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import type { NetworkJson } from '@extension-base/types';

const cache = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { void cache.read().then(update); }
  getAndWait() { return cache.read(); }
  set(...args: unknown[]) { cache.write(...args); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
} }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
const historical = () => readSnapshot().find(({ name }) => name === 'Polkadot')!;

describe('offline network startup', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    cache.read.mockResolvedValue(undefined);
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
  });

  it('opens a released registry cache without rewriting it when the remote registry fails', async () => {
    const old = { ...historical(), favorite: ['existing-wallet'], customNodes: [{ name: 'Personal', url: 'wss://personal.invalid' }] };
    cache.read.mockResolvedValue({ Polkadot: old });
    const service = create();
    await expect(service.initNetworkMap()).resolves.toBeUndefined();
    expect(service.networkMap.Polkadot).toMatchObject(old);
    expect(service.networkValues.some(({ ecosystem }) => ecosystem === 'bitcoin')).toBe(true);
    expect(service.authoritativeDiscoveryNetworks.some(({ name }) => name === 'Polkadot')).toBe(false);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('starts from bundled networks with an absent or corrupt rebuildable cache', async () => {
    cache.read.mockResolvedValue({ broken: null, Polkadot: historical() });
    const service = create();
    await service.initNetworkMap();
    expect(service.networkMap.broken).toBeUndefined();
    expect(service.networkMap.Polkadot.chainId).toBe(historical().chainId);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('retries the remote registry and keeps personal settings when connectivity returns', async () => {
    cache.read.mockResolvedValue({ Polkadot: { ...historical(), favorite: ['owner'] } });
    const service = create();
    await service.initNetworkMap();
    vi.mocked(axios.get).mockResolvedValue({ data: [historical()] });
    await service.initNetworkMap();
    expect(service.networkMap.Polkadot.favorite).toEqual(['owner']);
    expect(service.networksGithub.map(({ name }) => name)).toEqual(['Polkadot']);
    expect(cache.write).toHaveBeenCalledOnce();
  });

  it.each([null, {}, [], [{ name: 'broken' }]].map((data) => ({ data })))('uses the cache if the remote registry is malformed: $data', async ({ data }) => {
    cache.read.mockResolvedValue({ Polkadot: historical() });
    vi.mocked(axios.get).mockResolvedValue({ data });
    const service = create();
    await service.initNetworkMap();
    expect(service.networkMap.Polkadot.chainId).toBe(historical().chainId);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('tolerates an unreadable rebuildable cache while retaining bundled networks', async () => {
    cache.read.mockRejectedValue(new Error('storage temporarily unavailable'));
    const service = create();
    await service.initNetworkMap();
    expect(service.networkValues.some(({ ecosystem }) => ecosystem === 'bitcoin')).toBe(true);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('does not overwrite unread personal settings when the remote fetch succeeds', async () => {
    cache.read.mockRejectedValue(new Error('IO error'));
    vi.mocked(axios.get).mockResolvedValue({ data: [historical()] });
    await create().initNetworkMap();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('isolates malformed options without discarding a healthy registry row', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [
      { ...historical(), name: 'Bad options', options: {} }, historical(),
    ] });
    const service = create();
    await service.initNetworkMap();
    expect(service.networkMap.Polkadot).toBeDefined();
    expect(service.networkMap['Bad options']).toBeUndefined();
  });

  it('shares a single retry after the cooldown and stops retrying after success', async () => {
    vi.useFakeTimers();
    const service = create();
    const apis = vi.spyOn(service, 'initNetworkApis').mockImplementation(() => {});
    await service.initNetworkMap();
    await service.retryRegistryIfNeeded();
    expect(axios.get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    let release!: (value: unknown) => void;
    vi.mocked(axios.get).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const first = service.retryRegistryIfNeeded();
    const second = service.retryRegistryIfNeeded();
    expect(first).toBe(second);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    release({ data: [historical()] });
    await expect(first).resolves.toBe(true);
    expect(apis).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    await expect(service.retryRegistryIfNeeded()).resolves.toBe(false);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('isolates a bad remote row from healthy rows', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [null, historical(), { name: 'no nodes' } as NetworkJson] });
    const service = create();
    await service.initNetworkMap();
    expect(service.networksGithub.map(({ name }) => name)).toEqual(['Polkadot']);
    expect(service.networkMap.Polkadot.chainId).toBe(historical().chainId);
  });
});
