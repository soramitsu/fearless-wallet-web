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
  updatedAt: number;
  actions: Record<MutableAction, boolean>;
  assetDiscoveryMode: 'shadow' | 'visible';
};

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

type ActionCapabilityStorage = {
  read: () => Promise<ActionCapabilityConfig | undefined>;
  write: (config: ActionCapabilityConfig) => Promise<void>;
};

export class ActionCapabilityService {
  private config = failClosedActionCapabilities();

  constructor(private readonly storage: ActionCapabilityStorage) {}

  async init(): Promise<ActionCapabilityConfig> {
    this.config = (await this.storage.read()) ?? failClosedActionCapabilities();

    try {
      const { data } = await axios.get<unknown>(URLS.FEATURES);
      this.config = parseActionCapabilityConfig(data);
      await this.storage.write(this.config);
    } catch {
      // A persisted last-known configuration is usable; first-run failure is
      // deliberately fail-closed for mutations and discovered-asset surfacing.
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
