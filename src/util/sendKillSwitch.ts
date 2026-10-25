/**
 * Remote kill switch for the Bitcoin and Solana sends.
 *
 * The remote config is veto-only and sticky:
 * - an explicit remote `false` vetoes the send and is remembered;
 * - only a later successful fetch with an explicit `true` lifts that veto;
 * - an absent key, a non-boolean value or a failed fetch keeps whatever was
 *   remembered, and with nothing remembered the compiled default applies.
 *
 * Nothing here can enable a send that the build compiled off; callers combine
 * the vetoes with the compile-time flags in `releaseFeatures.ts`.
 */

export type SendCapability = 'bitcoinSend' | 'solanaSend';

export type SendCapabilityVetoes = Partial<Record<SendCapability, boolean>>;

export type SendKillSwitchState = {
  schemaVersion: 1;
  updatedAt: number;
  vetoes: Record<SendCapability, boolean>;
};

export const SEND_CAPABILITIES: readonly SendCapability[] = Object.freeze(['bitcoinSend', 'solanaSend']);

// `actions.*` is the web_config.json shape; the snake_case names are the keys the
// mobile apps read from appConfigs/feature_toggle, accepted here so one prepared
// veto payload means the same thing everywhere.
const REMOTE_KEYS: Readonly<Record<SendCapability, readonly string[]>> = Object.freeze({
  bitcoinSend: ['bitcoinSend', 'bitcoin_send_enabled'],
  solanaSend: ['solanaSend', 'solana_send_enabled'],
});

const REMOTE_SECTIONS = ['actions', 'actionCapabilities', 'feature_toggle'] as const;

export const emptySendKillSwitchState = (): SendKillSwitchState => ({
  schemaVersion: 1,
  updatedAt: 0,
  vetoes: { bitcoinSend: false, solanaSend: false },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Explicit booleans the remote config sets for each send. When the sections
 * disagree, `false` wins: a veto anywhere is a veto.
 */
export function readRemoteSendFlags(raw: unknown): Partial<Record<SendCapability, boolean>> {
  const root = isRecord(raw) ? raw : {};
  const sections = REMOTE_SECTIONS.map((name) => root[name]).filter(isRecord);
  const flags: Partial<Record<SendCapability, boolean>> = {};

  SEND_CAPABILITIES.forEach((capability) => {
    const values = sections.flatMap((section) =>
      REMOTE_KEYS[capability].map((key) => section[key]).filter((value): value is boolean => typeof value === 'boolean')
    );

    if (values.includes(false)) flags[capability] = false;
    else if (values.includes(true)) flags[capability] = true;
  });

  return flags;
}

/** Applies one successfully fetched remote config to the remembered state. */
export function applyRemoteSendFlags(
  previous: SendKillSwitchState | undefined,
  raw: unknown,
  now = Date.now()
): SendKillSwitchState {
  const base = normalizeSendKillSwitchState(previous);
  const flags = readRemoteSendFlags(raw);
  const vetoes = { ...base.vetoes };

  SEND_CAPABILITIES.forEach((capability) => {
    if (flags[capability] === false) vetoes[capability] = true;
    else if (flags[capability] === true) vetoes[capability] = false;
  });

  return { schemaVersion: 1, updatedAt: now, vetoes };
}

/** A missing or unreadable remembered state means no veto is remembered. */
export function normalizeSendKillSwitchState(value: unknown): SendKillSwitchState {
  const state = emptySendKillSwitchState();

  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.vetoes)) return state;

  const vetoes = value.vetoes;

  SEND_CAPABILITIES.forEach((capability) => {
    state.vetoes[capability] = vetoes[capability] === true;
  });
  state.updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;

  return state;
}

export function isSendCapabilityVetoed(capability: SendCapability, vetoes?: SendCapabilityVetoes): boolean {
  return vetoes?.[capability] === true;
}
