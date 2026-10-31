import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService, REGISTRY_RETRY_ALARM } from '@extension-base/services/network-service';
import { readSnapshot } from '../fixtures/legacy-305/generate';

const alarms = vi.hoisted(() => {
  const existing = new Map<string, { name: string; periodInMinutes?: number }>();
  return {
    existing,
    get: vi.fn(async (name: string) => existing.get(name)),
    create: vi.fn(async (name: string, info: { periodInMinutes: number }) => { existing.set(name, { name, ...info }); }),
    clear: vi.fn(async (name: string) => existing.delete(name)),
  };
});
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { alarms } }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get() {}
  getAndWait() { return Promise.resolve({}); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  getAndWait() { return Promise.resolve({}); }
  set() {}
} }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
const registry = () => ({ data: [readSnapshot().find(({ name }) => name === 'Polkadot')!] });
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe('the registry retry alarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alarms.existing.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is not created, and an older build\'s alarm is cleared, when the registry loads at start-up', async () => {
    alarms.existing.set(REGISTRY_RETRY_ALARM, { name: REGISTRY_RETRY_ALARM, periodInMinutes: 1 });
    vi.mocked(axios.get).mockResolvedValue(registry());

    await create().initNetworkMap();
    await settle();

    expect(alarms.create).not.toHaveBeenCalled();
    expect(alarms.existing.has(REGISTRY_RETRY_ALARM)).toBe(false);
  });

  it('is created while the bundled list is in use, and cleared once a retry loads the registry', async () => {
    vi.useFakeTimers();
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    const service = create();
    vi.spyOn(service, 'initNetworkApis').mockImplementation(() => undefined);

    await service.initNetworkMap();
    await settle();
    expect(alarms.create).toHaveBeenCalledExactlyOnceWith(REGISTRY_RETRY_ALARM, { periodInMinutes: 1 });

    // Still offline at the next retry: the alarm is kept, not rescheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    await service.retryRegistryIfNeeded();
    await settle();
    expect(alarms.create).toHaveBeenCalledOnce();

    vi.mocked(axios.get).mockResolvedValue(registry());
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(service.retryRegistryIfNeeded()).resolves.toBe(true);
    await settle();
    expect(alarms.existing.has(REGISTRY_RETRY_ALARM)).toBe(false);
  });
});
