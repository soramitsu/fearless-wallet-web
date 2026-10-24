import axios from 'axios';
import { URLS } from '@/consts/urls';

export type MutableAction =
  | 'polkaswap'
  | 'demeter'
  | 'polkamarkt'
  | 'crossChainXcm'
  | 'crossChainSoraBridge'
  | 'crossChainLiberland';

export type ActionCapabilityConfig = {
  schemaVersion: 1;
  /** Local time of the fetch that produced this configuration. */
  updatedAt: number;
  actions: Record<MutableAction, boolean>;
  assetDiscoveryMode: 'shadow' | 'visible';
};

/**
 * A remote switch-off has to reach the wallet even when the configuration cannot be fetched: a cached configuration
 * older than this enables nothing, so a blocked or failing fetch cannot keep an action on indefinitely.
 */
export const ACTION_CAPABILITY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** While the background runs, the configuration is fetched again once it is this old and an action is checked. */
export const ACTION_CAPABILITY_REFRESH_MS = 15 * 60 * 1000;

const disabledActions = (): Record<MutableAction, boolean> => ({
  polkaswap: false,
  demeter: false,
  polkamarkt: false,
  crossChainXcm: false,
  crossChainSoraBridge: false,
  crossChainLiberland: false,
});

export const failClosedActionCapabilities = (): ActionCapabilityConfig => ({
  schemaVersion: 1,
  updatedAt: 0,
  actions: disabledActions(),
  assetDiscoveryMode: 'shadow',
});

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export function parseActionCapabilityConfig(value: unknown, now = Date.now()): ActionCapabilityConfig {
  const root = record(value);
  const actions = record(root.actions ?? root.actionCapabilities ?? root.feature_toggle);
  const discovery = record(root.portfolio ?? root.assetDiscovery);
  const result = failClosedActionCapabilities();

  (Object.keys(result.actions) as MutableAction[]).forEach((key) => {
    if (typeof actions[key] === 'boolean') result.actions[key] = actions[key] as boolean;
  });

  const mode = root.assetDiscoveryMode ?? discovery.mode;
  if (mode === 'visible' || mode === 'shadow') result.assetDiscoveryMode = mode;
  result.updatedAt = now;
  return result;
}

/** Reads a persisted configuration defensively: anything malformed is the fail-closed configuration. */
export function parseStoredActionCapabilityConfig(value: unknown): ActionCapabilityConfig {
  const root = record(value);
  if (root.schemaVersion !== 1 || typeof root.updatedAt !== 'number' || !Number.isFinite(root.updatedAt)) {
    return failClosedActionCapabilities();
  }

  return parseActionCapabilityConfig(root, root.updatedAt);
}

/** True while a configuration fetched at `updatedAt` may still be used at `now`. */
export function isActionCapabilityConfigFresh(updatedAt: number, now: number): boolean {
  const age = now - updatedAt;

  return Number.isFinite(age) && age >= 0 && age <= ACTION_CAPABILITY_MAX_AGE_MS;
}

type ActionCapabilityStorage = {
  read: () => Promise<unknown>;
  write: (config: ActionCapabilityConfig) => Promise<void>;
};

export class ActionCapabilityService {
  private config = failClosedActionCapabilities();
  private lastAttempt = Number.NEGATIVE_INFINITY;
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly storage: ActionCapabilityStorage,
    private readonly now: () => number = () => Date.now()
  ) {}

  async init(): Promise<ActionCapabilityConfig> {
    this.config = parseStoredActionCapabilityConfig(await this.storage.read());
    await this.refresh();

    return this.snapshot;
  }

  /** Fetches the remote configuration. A failure keeps the cached one, which still expires on its own. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;

    this.lastAttempt = this.now();
    this.refreshing = (async () => {
      try {
        const { data } = await axios.get<unknown>(URLS.FEATURES);
        this.config = parseActionCapabilityConfig(data, this.now());
        await this.storage.write(this.config);
      } catch {
        // A recent last-known configuration stays usable until it expires; first-run failure is
        // deliberately fail-closed for mutations and discovered-asset surfacing.
      } finally {
        this.refreshing = undefined;
      }
    })();

    return this.refreshing;
  }

  isActionEnabled(action: MutableAction): boolean {
    return this.current().actions[action] === true;
  }

  shouldSurfaceDiscoveredAssets(): boolean {
    return this.current().assetDiscoveryMode === 'visible';
  }

  get snapshot(): ActionCapabilityConfig {
    return this.current();
  }

  private current(): ActionCapabilityConfig {
    const now = this.now();
    if (!this.refreshing && now - this.lastAttempt >= ACTION_CAPABILITY_REFRESH_MS) void this.refresh();

    return isActionCapabilityConfigFresh(this.config.updatedAt, now) ? this.config : failClosedActionCapabilities();
  }
}
