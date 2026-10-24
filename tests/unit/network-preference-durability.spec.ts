import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import type { NetworkJson } from '@extension-base/types';

const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  getSubject() { return { next() {} }; }
  getAndWait() { return io.read(); }
  set(key: string, value: unknown) { void io.write(key, value).catch(() => {}); }
  setAndWait(key: string, value: unknown) { return io.write(key, value); }
  async updateAndWait(key: string, transform: (current: unknown) => unknown, publish?: (value: unknown) => void) {
    const value = transform(await io.read());
    await io.write(key, value);
    publish?.(value);
    return value;
  }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
} }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
const update = (service: NetworkService): NetworkJson => ({ ...service.networkMap.Bitcoin,
  isManual: true, currentProvider: 'https://personal.invalid', customNodes: [{ name: 'Personal', url: 'https://personal.invalid' }] });

describe('network preference durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    io.read.mockResolvedValue(undefined);
    io.write.mockResolvedValue(undefined);
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
  });

  it('does not announce or apply a custom provider until storage acknowledges it', async () => {
    const service = create();
    await service.initNetworkMap();
    const before = structuredClone(service.networkMap.Bitcoin);
    let acknowledge!: () => void;
    io.write.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    let complete = false;
    const pending = Promise.resolve(service.upsertNetworkMap(update(service))).then(() => { complete = true; });
    await vi.waitFor(() => expect(io.write).toHaveBeenCalled());
    expect(complete).toBe(false);
    expect(service.networkMap.Bitcoin).toEqual(before);
    acknowledge();
    await pending;
    expect(service.networkMap.Bitcoin.currentProvider).toBe('https://personal.invalid');
  });

  it('rejects an edit while the existing settings cannot be read and preserves runtime preferences', async () => {
    io.read.mockRejectedValue(new Error('cache unavailable'));
    const service = create();
    await service.initNetworkMap();
    const before = structuredClone(service.networkMap.Bitcoin);
    await expect(Promise.resolve().then(() => service.upsertNetworkMap(update(service)))).rejects.toThrow();
    expect(service.networkMap.Bitcoin).toEqual(before);
    expect(io.write).not.toHaveBeenCalled();
  });

  it('rejects a failed write without replacing the current provider or custom nodes', async () => {
    const service = create();
    await service.initNetworkMap();
    const before = structuredClone(service.networkMap.Bitcoin);
    io.write.mockRejectedValue(new Error('disk full'));
    await expect(Promise.resolve().then(() => service.upsertNetworkMap(update(service)))).rejects.toThrow('disk full');
    expect(service.networkMap.Bitcoin).toEqual(before);
  });

  it('does not overwrite unrelated saved settings when a previously unread cache becomes available', async () => {
    io.read.mockRejectedValue(new Error('cache unavailable'));
    const service = create();
    await service.initNetworkMap();
    const saved = { ...readSnapshot().find(({ name }) => name === 'Polkadot')!, favorite: ['saved-owner'] };
    io.read.mockResolvedValue({ Polkadot: saved });
    await service.upsertNetworkMap(update(service));
    expect(io.write).toHaveBeenCalled();
    expect(io.write.mock.calls.at(-1)?.[1].Polkadot).toEqual(saved);
  });
});
