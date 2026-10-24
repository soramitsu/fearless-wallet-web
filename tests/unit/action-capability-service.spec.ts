import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_CAPABILITY_MAX_AGE_MS,
  ACTION_CAPABILITY_REFRESH_MS,
  ActionCapabilityService,
  failClosedActionCapabilities,
  isActionCapabilityConfigFresh,
  parseActionCapabilityConfig,
  parseStoredActionCapabilityConfig,
} from '@extension-base/services/action-capability-service';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

const NOW = 1_800_000_000_000;

describe('ActionCapabilityService', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it('fails closed for absent mutation and discovery rollout fields', () => {
    expect(parseActionCapabilityConfig({ fiat: { moonpay: true } }, 1)).toEqual({
      ...failClosedActionCapabilities(),
      updatedAt: 1,
    });
  });

  it('keeps a recent persisted snapshot when the remote source is unavailable', async () => {
    const cached = parseActionCapabilityConfig({ actions: { demeter: true }, assetDiscoveryMode: 'visible' }, NOW - 60_000);
    const write = vi.fn();
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));
    const service = new ActionCapabilityService({ read: async () => cached, write }, () => NOW);

    await expect(service.init()).resolves.toEqual(cached);
    expect(service.isActionEnabled('demeter')).toBe(true);
    expect(service.shouldSurfaceDiscoveredAssets()).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it('enables nothing from a persisted snapshot older than the maximum age', async () => {
    const cached = parseActionCapabilityConfig(
      { actions: { crossChainXcm: true }, assetDiscoveryMode: 'visible' },
      NOW - ACTION_CAPABILITY_MAX_AGE_MS - 1
    );
    vi.mocked(axios.get).mockRejectedValue(new Error('blocked'));
    const service = new ActionCapabilityService({ read: async () => cached, write: vi.fn() }, () => NOW);

    await expect(service.init()).resolves.toEqual(failClosedActionCapabilities());
    expect(service.isActionEnabled('crossChainXcm')).toBe(false);
    expect(service.shouldSurfaceDiscoveredAssets()).toBe(false);
  });

  it('lets a running background lose a stale flag and pick up a remote switch-off', async () => {
    let now = NOW;
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { actions: { crossChainXcm: true } } });
    const write = vi.fn();
    const service = new ActionCapabilityService({ read: async () => undefined, write }, () => now);
    await service.init();
    expect(service.isActionEnabled('crossChainXcm')).toBe(true);

    // The next fetches fail: the cached flag holds until it is too old.
    vi.mocked(axios.get).mockRejectedValue(new Error('blocked'));
    now += ACTION_CAPABILITY_REFRESH_MS;
    expect(service.isActionEnabled('crossChainXcm')).toBe(true);
    await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));

    now = NOW + ACTION_CAPABILITY_MAX_AGE_MS + 1;
    expect(service.isActionEnabled('crossChainXcm')).toBe(false);
    await service.refresh();

    // A later fetch that succeeds switches it off for good.
    vi.mocked(axios.get).mockResolvedValue({ data: { actions: { crossChainXcm: false } } });
    now += ACTION_CAPABILITY_REFRESH_MS;
    service.isActionEnabled('crossChainXcm');
    await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ updatedAt: now })));
    expect(service.isActionEnabled('crossChainXcm')).toBe(false);
  });

  it('does not fetch again before the refresh interval', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { actions: { polkaswap: true } } });
    let now = NOW;
    const service = new ActionCapabilityService({ read: async () => undefined, write: vi.fn() }, () => now);
    await service.init();

    now += ACTION_CAPABILITY_REFRESH_MS - 1;
    service.isActionEnabled('polkaswap');

    expect(axios.get).toHaveBeenCalledOnce();
  });

  it.each([
    ['nothing', undefined],
    ['another schema', { schemaVersion: 2, updatedAt: NOW, actions: { polkaswap: true } }],
    ['no fetch time', { schemaVersion: 1, actions: { polkaswap: true } }],
    ['a text fetch time', { schemaVersion: 1, updatedAt: String(NOW), actions: { polkaswap: true } }],
    ['text flags', { schemaVersion: 1, updatedAt: NOW, actions: { polkaswap: 'true' } }],
  ])('reads %s in storage as the fail-closed configuration', (_label, stored) => {
    expect(parseStoredActionCapabilityConfig(stored).actions.polkaswap).toBe(false);
  });

  it('treats a fetch time in the future as stale', () => {
    expect(isActionCapabilityConfigFresh(NOW + 1, NOW)).toBe(false);
    expect(isActionCapabilityConfigFresh(NOW, NOW)).toBe(true);
    expect(isActionCapabilityConfigFresh(NOW - ACTION_CAPABILITY_MAX_AGE_MS, NOW)).toBe(true);
    expect(isActionCapabilityConfigFresh(Number.NaN, NOW)).toBe(false);
  });
});
