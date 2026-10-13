import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Extension is exercised through its prototype; its services are never built.
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import { api as apiSora } from '@sora-substrate/util';
import Extension from '@extension-base/background/handlers/Extension';
import {
  ActionCapabilityService,
  type ActionCapabilityConfig,
} from '@extension-base/services/action-capability-service';
import { PoolsService } from '@extension-base/services/pools-service';
import type State from '@extension-base/background/handlers/State';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';

const memoryStorage = (stored?: unknown) => ({
  read: vi.fn(async () => stored),
  write: vi.fn(async (_config: ActionCapabilityConfig) => undefined),
});

// The capability service a user's background ends up with after upgrading: what
// it remembered (nothing, a schema 1 internal-build snapshot, or a schema 2
// snapshot) and what the remote config returns (or a failed fetch).
const capabilitiesAfterUpgrade = async (stored: unknown, remote: unknown | Error) => {
  if (remote instanceof Error) vi.mocked(axios.get).mockRejectedValue(remote);
  else vi.mocked(axios.get).mockResolvedValue({ data: remote });

  const service = new ActionCapabilityService(memoryStorage(stored));
  await service.init();

  return service;
};

const demeterCatalog = async (actionCapabilityService: unknown) => {
  const state = {
    actionCapabilityService,
    soraFees: { value: {} },
    getAccountAddress: () => '',
  } as unknown as State;

  return new PoolsService(state).getDemeterPools();
};

const withDemeterModule = async <T>(module: unknown, run: () => Promise<T>): Promise<T> => {
  const sora = apiSora as unknown as { demeterFarming?: unknown };
  const previous = sora.demeterFarming;
  sora.demeterFarming = module;

  try {
    return await run();
  } finally {
    sora.demeterFarming = previous;
  }
};

// Resolves to an empty catalog without a runtime, so the successful branch runs.
const emptyDemeterModule = {
  getPoolsObservable: async () => null,
  getTokenInfosObservable: async () => null,
};

const polkamarktSnapshot = (): PolkamarktSnapshot => ({
  network: 'SORA Mainnet',
  collateral: 'KUSD',
  feeAsset: 'XOR',
  currentBlock: '1',
  markets: [],
  history: [],
  positions: [],
  trades: [],
  claimable: [],
  capabilities: {
    browse: true,
    quoteBuy: true,
    quoteSell: true,
    marketState: true,
    buy: true,
    sell: true,
    claimMarket: true,
    claimCreatorFees: true,
    reasons: [],
  },
  account: { address: null, signable: false, hasKusd: false, hasXorForFees: false },
  indexerStale: false,
  warnings: [],
});

const snapshotWith = async (enabled: boolean) => {
  const extension = Object.assign(Object.create(Extension.prototype) as Extension, {
    state: { keyringService: { isResetting: false }, actionCapabilityService: { isActionEnabled: vi.fn().mockReturnValue(enabled) } },
    createPolkamarktService: () => ({ snapshot: async () => polkamarktSnapshot() }),
  });

  return (await Extension.prototype.handle.call(
    extension,
    'id',
    'pri(defi.polkamarkt.snapshot)',
    {},
    undefined as never
  )) as PolkamarktSnapshot;
};

describe('DeFi capabilities that the 4.2.0 release policy keeps off', () => {
  afterEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it.each([
    ['a fresh install offline', undefined, new Error('offline')],
    ['a 3.0.5 upgrade with the live config, which only carries fiat', undefined, { fiat: { moonpay: true } }],
    [
      'an internal build that cached a schema 1 snapshot',
      { schemaVersion: 1, updatedAt: 1, actions: { demeter: true, polkamarkt: true } },
      new Error('offline'),
    ],
    ['a remote true, which never enables a compiled-off capability', undefined, { actions: { demeter: true, polkamarkt: true } }],
  ])('reports Demeter actions as paused after %s', async (_case, stored, remote) => {
    const capabilities = await capabilitiesAfterUpgrade(stored, remote);

    await expect(withDemeterModule(emptyDemeterModule, () => demeterCatalog(capabilities))).resolves.toMatchObject({
      available: true,
      actionsPaused: true,
      pools: [],
    });
  });

  it('keeps Polkaswap on by default, so only the release-off capabilities are paused', async () => {
    const capabilities = await capabilitiesAfterUpgrade(undefined, { fiat: { moonpay: true } });

    expect(capabilities.isActionEnabled('polkaswap')).toBe(true);
    expect(capabilities.isActionEnabled('demeter')).toBe(false);
    expect(capabilities.isActionEnabled('polkamarkt')).toBe(false);
  });

  it('reports the pause on every catalog branch, including an unavailable runtime', async () => {
    const paused = { isActionEnabled: vi.fn().mockReturnValue(false) };
    const failing = {
      getPoolsObservable: async () => {
        throw new Error('runtime offline');
      },
      getTokenInfosObservable: async () => null,
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(withDemeterModule(undefined, () => demeterCatalog(paused))).resolves.toMatchObject({
      available: false,
      actionsPaused: true,
    });
    await expect(withDemeterModule(failing, () => demeterCatalog(paused))).resolves.toMatchObject({
      available: false,
      actionsPaused: true,
    });
    expect(paused.isActionEnabled).toHaveBeenCalledWith('demeter');
  });

  it('does not report a pause when the capability is on', async () => {
    const enabled = { isActionEnabled: vi.fn().mockReturnValue(true) };

    await expect(withDemeterModule(emptyDemeterModule, () => demeterCatalog(enabled))).resolves.toMatchObject({
      available: true,
      actionsPaused: false,
    });
  });

  it('fails closed when the capability service is missing', async () => {
    await expect(withDemeterModule(emptyDemeterModule, () => demeterCatalog(undefined))).resolves.toMatchObject({
      actionsPaused: true,
    });
  });

  it('marks a paused Polkamarkt snapshot browse-only without reporting a data problem', async () => {
    const snapshot = await snapshotWith(false);

    expect(snapshot.actionsPaused).toBe(true);
    expect(snapshot.capabilities).toMatchObject({
      browse: true,
      buy: false,
      sell: false,
      claimMarket: false,
      claimCreatorFees: false,
    });
    expect(snapshot.warnings).toEqual([]);
  });

  it('leaves an enabled Polkamarkt snapshot untouched', async () => {
    const snapshot = await snapshotWith(true);

    expect(snapshot.actionsPaused).toBe(false);
    expect(snapshot.capabilities).toMatchObject({ buy: true, sell: true, claimMarket: true, claimCreatorFees: true });
  });
});
