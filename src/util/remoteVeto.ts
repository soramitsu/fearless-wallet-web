/**
 * The veto-only, sticky reading of a remote switch, shared by the send kill switch (`sendKillSwitch.ts`) and the dApp
 * signing kill switch (`dappSigningKillSwitch.ts`) so that one published payload means the same thing to both:
 * - only an explicit boolean counts, and when the sections disagree `false` wins: a veto anywhere is a veto;
 * - an explicit `false` vetoes and is remembered, and only a later explicit `true` lifts it;
 * - an absent key, a non-boolean value or a failed fetch keeps whatever was remembered, and with nothing remembered
 *   nothing is vetoed.
 */

export type RemoteVetoState<C extends string> = {
  schemaVersion: 1;
  updatedAt: number;
  vetoes: Record<C, boolean>;
};

// `actions.*` is the web_config.json shape; `feature_toggle` carries the snake_case keys the mobile apps read.
const REMOTE_SECTIONS = ['actions', 'actionCapabilities', 'feature_toggle'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const capabilitiesOf = <C extends string>(keys: Readonly<Record<C, readonly string[]>>): C[] => Object.keys(keys) as C[];

export function emptyRemoteVetoState<C extends string>(capabilities: readonly C[]): RemoteVetoState<C> {
  return {
    schemaVersion: 1,
    updatedAt: 0,
    vetoes: Object.fromEntries(capabilities.map((capability) => [capability, false])) as Record<C, boolean>,
  };
}

/** The explicit booleans a remote config sets for each capability, read under any of its names in any section. */
export function readRemoteVetoFlags<C extends string>(
  raw: unknown,
  keys: Readonly<Record<C, readonly string[]>>
): Partial<Record<C, boolean>> {
  const root = isRecord(raw) ? raw : {};
  const sections = REMOTE_SECTIONS.map((name) => root[name]).filter(isRecord);
  const flags: Partial<Record<C, boolean>> = {};

  capabilitiesOf(keys).forEach((capability) => {
    const values = sections.flatMap((section) =>
      keys[capability].map((key) => section[key]).filter((value): value is boolean => typeof value === 'boolean')
    );

    if (values.includes(false)) flags[capability] = false;
    else if (values.includes(true)) flags[capability] = true;
  });

  return flags;
}

/** A missing or unreadable remembered state means no veto is remembered. */
export function normalizeRemoteVetoState<C extends string>(value: unknown, capabilities: readonly C[]): RemoteVetoState<C> {
  const state = emptyRemoteVetoState(capabilities);

  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.vetoes)) return state;

  const vetoes = value.vetoes;

  capabilities.forEach((capability) => {
    state.vetoes[capability] = vetoes[capability] === true;
  });
  state.updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;

  return state;
}

/** Applies one successfully fetched remote config to the remembered state. */
export function applyRemoteVetoFlags<C extends string>(
  previous: unknown,
  raw: unknown,
  keys: Readonly<Record<C, readonly string[]>>,
  now: number
): RemoteVetoState<C> {
  const capabilities = capabilitiesOf(keys);
  const base = normalizeRemoteVetoState(previous, capabilities);
  const flags = readRemoteVetoFlags(raw, keys);
  const vetoes = { ...base.vetoes };

  capabilities.forEach((capability) => {
    if (flags[capability] === false) vetoes[capability] = true;
    else if (flags[capability] === true) vetoes[capability] = false;
  });

  return { schemaVersion: 1, updatedAt: now, vetoes };
}
