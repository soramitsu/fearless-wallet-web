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
  schemaVersion: 2;
  updatedAt: number;
  /**
   * Explicit remote booleans remembered across fetches. Only a `false` has an
   * effect (a veto); a later explicit `true` is what clears it.
   */
  remoteActions: Partial<Record<MutableAction, boolean>>;
  actions: Record<MutableAction, boolean>;
  assetDiscoveryMode: 'shadow' | 'visible';
};

/**
 * Compiled release policy. Remote configuration is veto-only: it can switch a
 * capability off, but an absent key, a failed fetch or a remote `true` never
 * enables a capability that is off here. Turning one of these on needs a new
 * build with funded route evidence.
 */
export const RELEASE_DEFAULT_ACTIONS: Readonly<Record<MutableAction, boolean>> = Object.freeze({
  polkaswap: true,
  demeter: false,
  polkamarkt: false,
  crossChainXcm: false,
  crossChainSoraBridge: false,
  crossChainLiberland: false,
});

const MUTABLE_ACTIONS = Object.keys(RELEASE_DEFAULT_ACTIONS) as MutableAction[];

const disabledActions = (): Record<MutableAction, boolean> => ({
  polkaswap: false,
  demeter: false,
  polkamarkt: false,
  crossChainXcm: false,
  crossChainSoraBridge: false,
  crossChainLiberland: false,
});

/** Used until the remembered vetoes have been read, and as the discovery `shadow` default. */
export const failClosedActionCapabilities = (): ActionCapabilityConfig => ({
  schemaVersion: 2,
  updatedAt: 0,
  remoteActions: {},
  actions: disabledActions(),
  assetDiscoveryMode: 'shadow',
});

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const explicitActions = (value: unknown): Partial<Record<MutableAction, boolean>> => {
  const actions = record(value);
  const result: Partial<Record<MutableAction, boolean>> = {};

  MUTABLE_ACTIONS.forEach((key) => {
    if (typeof actions[key] === 'boolean') result[key] = actions[key] as boolean;
  });

  return result;
};

/** Explicit booleans from a remote config. Anything else is ignored, so the release default applies. */
export function readRemoteActions(value: unknown): Partial<Record<MutableAction, boolean>> {
  const root = record(value);
  const actions = record(root.actions ?? root.actionCapabilities ?? root.feature_toggle);

  MUTABLE_ACTIONS.forEach((key) => {
    if (actions[key] !== undefined && typeof actions[key] !== 'boolean') {
      console.warn(`Ignoring the non-boolean remote capability "${key}"`);
    }
  });

  return explicitActions(actions);
}

/**
 * Resolves one remote config against the release policy. `remembered` holds the
 * explicit values from earlier fetches: a key absent from `value` keeps its
 * remembered veto, so only an explicit `true` lifts it.
 */
export function resolveActionCapabilities(
  value: unknown,
  now = Date.now(),
  remembered: Partial<Record<MutableAction, boolean>> = {}
): ActionCapabilityConfig {
  const root = record(value);
  const discovery = record(root.portfolio ?? root.assetDiscovery);
  const remoteActions = { ...explicitActions(remembered), ...readRemoteActions(root) };
  const result = failClosedActionCapabilities();

  MUTABLE_ACTIONS.forEach((key) => {
    result.actions[key] = RELEASE_DEFAULT_ACTIONS[key] && remoteActions[key] !== false;
  });

  const mode = root.assetDiscoveryMode ?? discovery.mode;
  if (mode === 'visible' || mode === 'shadow') result.assetDiscoveryMode = mode;
  result.remoteActions = remoteActions;
  result.updatedAt = now;
  return result;
}

export const parseActionCapabilityConfig = resolveActionCapabilities;

/**
 * Re-derives a persisted snapshot with this build's policy. A schema 1 snapshot
 * (internal builds before 4.2.0) stored defaulted `false` values that cannot be
 * told apart from vetoes, and no published config ever set them, so only its
 * discovery mode is kept.
 */
export function restoreActionCapabilities(stored: unknown): ActionCapabilityConfig {
  const snapshot = record(stored);

  return resolveActionCapabilities(
    { assetDiscoveryMode: snapshot.assetDiscoveryMode },
    typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : 0,
    snapshot.schemaVersion === 2 ? explicitActions(snapshot.remoteActions) : {}
  );
}

type ActionCapabilityStorage = {
  read: () => Promise<unknown>;
  write: (config: ActionCapabilityConfig) => Promise<void>;
};

export class ActionCapabilityService {
  private config = failClosedActionCapabilities();

  constructor(private readonly storage: ActionCapabilityStorage) {}

  async init(): Promise<ActionCapabilityConfig> {
    this.config = restoreActionCapabilities(await this.storage.read());

    try {
      const { data } = await axios.get<unknown>(URLS.FEATURES);
      this.config = resolveActionCapabilities(data, Date.now(), this.config.remoteActions);
      await this.storage.write(this.config);
    } catch {
      // The remembered vetoes stay in force offline; without any, the release
      // defaults apply. Mutations are fail-closed only until storage is read.
    }

    return this.config;
  }

  isActionEnabled(action: MutableAction): boolean {
    return this.config.actions[action] === true;
  }

  shouldSurfaceDiscoveredAssets(): boolean {
    return this.config.assetDiscoveryMode === 'visible';
  }

  get snapshot(): ActionCapabilityConfig {
    return this.config;
  }
}
