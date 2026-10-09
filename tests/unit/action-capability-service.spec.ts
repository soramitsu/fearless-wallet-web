import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionCapabilityService,
  RELEASE_DEFAULT_ACTIONS,
  failClosedActionCapabilities,
  parseActionCapabilityConfig,
  resolveActionCapabilities,
  restoreActionCapabilities,
  type ActionCapabilityConfig,
  type MutableAction,
} from '@extension-base/services/action-capability-service';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

const releaseDefaults = {
  polkaswap: true,
  demeter: false,
  polkamarkt: false,
  crossChainXcm: false,
  crossChainSoraBridge: false,
  crossChainLiberland: false,
};

const allEnabled = Object.fromEntries(Object.keys(releaseDefaults).map((key) => [key, true])) as Record<
  MutableAction,
  boolean
>;

const memoryStorage = (stored?: unknown) => {
  const storage = {
    value: stored,
    read: vi.fn(async () => storage.value),
    write: vi.fn(async (config: ActionCapabilityConfig) => {
      storage.value = JSON.parse(JSON.stringify(config));
    }),
  };

  return storage;
};

const fetchesFail = () => vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
const fetchReturns = (data: unknown) => vi.mocked(axios.get).mockResolvedValue({ data });

describe('ActionCapabilityService', () => {
  afterEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.restoreAllMocks();
  });

  it('compiles the 4.2.0 release policy: Swap and Pools on, newer fund-moving capabilities off', () => {
    expect(RELEASE_DEFAULT_ACTIONS).toEqual(releaseDefaults);
    expect(Object.isFrozen(RELEASE_DEFAULT_ACTIONS)).toBe(true);
  });

  it.each([
    ['the live config, which only carries fiat', { fiat: { moonpay: true } }, releaseDefaults],
    ['an explicit Polkaswap veto', { actions: { polkaswap: false } }, { ...releaseDefaults, polkaswap: false }],
    [
      'a veto through actionCapabilities',
      { actionCapabilities: { polkaswap: false } },
      { ...releaseDefaults, polkaswap: false },
    ],
    [
      'a veto through feature_toggle',
      { feature_toggle: { polkaswap: false } },
      { ...releaseDefaults, polkaswap: false },
    ],
    ['a remote true for a compiled-off capability', { feature_toggle: { crossChainXcm: true } }, releaseDefaults],
    ['remote true for every capability', { actions: allEnabled }, releaseDefaults],
    ['a non-boolean value', { actions: { polkaswap: 'false', demeter: 1 } }, releaseDefaults],
    ['a null actions block', { actions: null }, releaseDefaults],
    ['an array actions block', { actions: [false] }, releaseDefaults],
    ['a non-object config', 'not json', releaseDefaults],
  ])('resolves %s veto-only', (_label, remote, expected) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const config = resolveActionCapabilities(remote, 1);

    expect(config.actions).toEqual(expected);
    expect(config.schemaVersion).toBe(2);
    expect(config.updatedAt).toBe(1);
    expect(config.assetDiscoveryMode).toBe('shadow');
  });

  it('keeps only explicit booleans as remote values and warns about the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      resolveActionCapabilities({ actions: { polkaswap: 'false', crossChainXcm: true, unknown: false } }, 1)
        .remoteActions
    ).toEqual({ crossChainXcm: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('polkaswap'));
  });

  it('keeps parseActionCapabilityConfig as the same policy', () => {
    expect(parseActionCapabilityConfig({ actions: { polkaswap: false } }, 3)).toEqual(
      resolveActionCapabilities({ actions: { polkaswap: false } }, 3)
    );
  });

  it('keeps a remembered veto when a later config omits the key, and lifts it only on an explicit true', () => {
    const vetoed = resolveActionCapabilities({ actions: { polkaswap: false } }, 1);
    const omitted = resolveActionCapabilities({ fiat: { moonpay: true } }, 2, vetoed.remoteActions);
    const lifted = resolveActionCapabilities({ actions: { polkaswap: true } }, 3, omitted.remoteActions);

    expect(omitted.actions.polkaswap).toBe(false);
    expect(omitted.remoteActions).toEqual({ polkaswap: false });
    expect(lifted.actions.polkaswap).toBe(true);
  });

  it('first run while offline uses the release defaults', async () => {
    fetchesFail();
    const storage = memoryStorage();
    const service = new ActionCapabilityService(storage);

    expect(service.isActionEnabled('polkaswap')).toBe(false);
    await service.init();

    expect(service.snapshot.actions).toEqual(releaseDefaults);
    expect(service.isActionEnabled('polkaswap')).toBe(true);
    expect(service.isActionEnabled('crossChainXcm')).toBe(false);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('a schema 1 snapshot does not keep its defaulted falses', async () => {
    fetchesFail();
    const service = new ActionCapabilityService(
      memoryStorage({
        schemaVersion: 1,
        updatedAt: 5,
        actions: { ...releaseDefaults, polkaswap: false },
        assetDiscoveryMode: 'visible',
      })
    );

    await service.init();

    expect(service.isActionEnabled('polkaswap')).toBe(true);
    expect(service.shouldSurfaceDiscoveredAssets()).toBe(true);
  });

  it('a schema 1 snapshot that enabled a capability cannot keep it enabled', async () => {
    fetchesFail();
    const service = new ActionCapabilityService(
      memoryStorage({ schemaVersion: 1, updatedAt: 5, actions: allEnabled, assetDiscoveryMode: 'shadow' })
    );

    await service.init();

    expect(service.snapshot.actions).toEqual(releaseDefaults);
  });

  it('a schema 2 snapshot keeps a remote veto offline', async () => {
    fetchesFail();
    const service = new ActionCapabilityService(
      memoryStorage({ schemaVersion: 2, updatedAt: 5, remoteActions: { polkaswap: false }, actions: releaseDefaults })
    );

    await service.init();

    expect(service.isActionEnabled('polkaswap')).toBe(false);
  });

  it('re-derives a schema 2 snapshot with this build policy instead of trusting its stored actions', () => {
    expect(
      restoreActionCapabilities({
        schemaVersion: 2,
        updatedAt: 5,
        remoteActions: { crossChainXcm: true, polkaswap: 'false' },
        actions: allEnabled,
      }).actions
    ).toEqual(releaseDefaults);
    expect(restoreActionCapabilities(undefined)).toEqual({
      ...failClosedActionCapabilities(),
      actions: releaseDefaults,
    });
    expect(restoreActionCapabilities({ schemaVersion: 2, remoteActions: null }).actions).toEqual(releaseDefaults);
  });

  it('a successful fetch overwrites the cache with schema version 2', async () => {
    fetchReturns({ fiat: { moonpay: true }, actions: { demeter: true }, assetDiscoveryMode: 'visible' });
    const storage = memoryStorage({ schemaVersion: 1, updatedAt: 1, actions: allEnabled });
    const service = new ActionCapabilityService(storage);

    await service.init();

    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(storage.value).toMatchObject({
      schemaVersion: 2,
      remoteActions: { demeter: true },
      actions: releaseDefaults,
      assetDiscoveryMode: 'visible',
    });
  });

  it('a successful fetch without the key keeps the remembered veto in the cache', async () => {
    fetchReturns({ fiat: { moonpay: true } });
    const storage = memoryStorage({ schemaVersion: 2, updatedAt: 1, remoteActions: { polkaswap: false } });
    const service = new ActionCapabilityService(storage);

    await service.init();

    expect(service.isActionEnabled('polkaswap')).toBe(false);
    expect(storage.value).toMatchObject({ remoteActions: { polkaswap: false } });
  });

  it('a veto survives a later failed fetch and is lifted by a later explicit true', async () => {
    const storage = memoryStorage();

    fetchReturns({ actions: { polkaswap: false } });
    await new ActionCapabilityService(storage).init();

    fetchesFail();
    const offline = new ActionCapabilityService(storage);
    await offline.init();
    expect(offline.isActionEnabled('polkaswap')).toBe(false);

    fetchReturns({ actions: { polkaswap: true } });
    const lifted = new ActionCapabilityService(storage);
    await lifted.init();
    expect(lifted.isActionEnabled('polkaswap')).toBe(true);
  });
});
