/**
 * Remote kill switch for the Bitcoin and Solana sends.
 *
 * The remote config is veto-only and sticky (`remoteVeto.ts`):
 * - an explicit remote `false` vetoes the send and is remembered;
 * - only a later successful fetch with an explicit `true` lifts that veto;
 * - an absent key, a non-boolean value or a failed fetch keeps whatever was
 *   remembered, and with nothing remembered the compiled default applies.
 *
 * Nothing here can enable a send that the build compiled off; callers combine
 * the vetoes with the compile-time flags in `releaseFeatures.ts`.
 */

import {
  applyRemoteVetoFlags,
  emptyRemoteVetoState,
  normalizeRemoteVetoState,
  readRemoteVetoFlags,
  type RemoteVetoState,
} from '@/util/remoteVeto';

export type SendCapability = 'bitcoinSend' | 'solanaSend';

export type SendCapabilityVetoes = Partial<Record<SendCapability, boolean>>;

export type SendKillSwitchState = RemoteVetoState<SendCapability>;

export const SEND_CAPABILITIES: readonly SendCapability[] = Object.freeze(['bitcoinSend', 'solanaSend']);

// `actions.*` is the web_config.json shape; the snake_case names are the keys the
// mobile apps read from appConfigs/feature_toggle, accepted here so one prepared
// veto payload means the same thing everywhere.
const REMOTE_KEYS: Readonly<Record<SendCapability, readonly string[]>> = Object.freeze({
  bitcoinSend: ['bitcoinSend', 'bitcoin_send_enabled'],
  solanaSend: ['solanaSend', 'solana_send_enabled'],
});

export const emptySendKillSwitchState = (): SendKillSwitchState => emptyRemoteVetoState(SEND_CAPABILITIES);

/**
 * Explicit booleans the remote config sets for each send. When the sections
 * disagree, `false` wins: a veto anywhere is a veto.
 */
export function readRemoteSendFlags(raw: unknown): Partial<Record<SendCapability, boolean>> {
  return readRemoteVetoFlags(raw, REMOTE_KEYS);
}

/** Applies one successfully fetched remote config to the remembered state. */
export function applyRemoteSendFlags(
  previous: SendKillSwitchState | undefined,
  raw: unknown,
  now = Date.now()
): SendKillSwitchState {
  return applyRemoteVetoFlags(previous, raw, REMOTE_KEYS, now);
}

/** A missing or unreadable remembered state means no veto is remembered. */
export function normalizeSendKillSwitchState(value: unknown): SendKillSwitchState {
  return normalizeRemoteVetoState(value, SEND_CAPABILITIES);
}

export function isSendCapabilityVetoed(capability: SendCapability, vetoes?: SendCapabilityVetoes): boolean {
  return vetoes?.[capability] === true;
}
