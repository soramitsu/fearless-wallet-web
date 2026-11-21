/**
 * Remote kill switch for signing dApp requests, one per network family.
 *
 * It reads the keys the mobile apps read (`polkadot_dapp_signing_enabled`, `evm_dapp_signing_enabled` and
 * `ton_dapp_signing_enabled`) plus `solana_dapp_signing_enabled`, because the extension's Solana provider signs for
 * dApps and the Solana send veto covers only `signAndSendTransaction`. Each also has a web_config name under
 * `actions` (`polkadotDappSigning`, ...). The rules are the send kill switch's (`remoteVeto.ts`): veto-only and
 * sticky, so an absent key, a non-boolean value or a failed fetch never pauses signing that is not already paused.
 *
 * Never read or write a key named `dapp_enabled`: the production feature toggle already holds it as `false`, a
 * legacy key that would pause every family at once.
 *
 * The extension has no TON dApp surface (TonConnect is not supported in this build), so the TON switch is read and
 * remembered but nothing checks it yet.
 */

import type { SigningRequestKind } from '@extension-base/services/request-service/signingRequestId';
import {
  applyRemoteVetoFlags,
  emptyRemoteVetoState,
  normalizeRemoteVetoState,
  readRemoteVetoFlags,
  type RemoteVetoState,
} from '@/util/remoteVeto';

export type DappSigningFamily = 'polkadot' | 'evm' | 'solana' | 'ton';

export type DappSigningVetoes = Partial<Record<DappSigningFamily, boolean>>;

export type DappSigningKillSwitchState = RemoteVetoState<DappSigningFamily>;

export const DAPP_SIGNING_FAMILIES: readonly DappSigningFamily[] = Object.freeze(['polkadot', 'evm', 'solana', 'ton']);

const REMOTE_KEYS: Readonly<Record<DappSigningFamily, readonly string[]>> = Object.freeze({
  polkadot: ['polkadotDappSigning', 'polkadot_dapp_signing_enabled'],
  evm: ['evmDappSigning', 'evm_dapp_signing_enabled'],
  solana: ['solanaDappSigning', 'solana_dapp_signing_enabled'],
  ton: ['tonDappSigning', 'ton_dapp_signing_enabled'],
});

/** Proper names shown in the paused message; they are not translated. */
export const DAPP_SIGNING_FAMILY_NAMES: Readonly<Record<DappSigningFamily, string>> = Object.freeze({
  polkadot: 'Polkadot',
  evm: 'EVM',
  solana: 'Solana',
  ton: 'TON',
});

export const emptyDappSigningKillSwitchState = (): DappSigningKillSwitchState =>
  emptyRemoteVetoState(DAPP_SIGNING_FAMILIES);

export function readRemoteDappSigningFlags(raw: unknown): Partial<Record<DappSigningFamily, boolean>> {
  return readRemoteVetoFlags(raw, REMOTE_KEYS);
}

/** Applies one successfully fetched remote config to the remembered state. */
export function applyRemoteDappSigningFlags(
  previous: DappSigningKillSwitchState | undefined,
  raw: unknown,
  now = Date.now()
): DappSigningKillSwitchState {
  return applyRemoteVetoFlags(previous, raw, REMOTE_KEYS, now);
}

/** A missing or unreadable remembered state means no family is paused. */
export function normalizeDappSigningKillSwitchState(value: unknown): DappSigningKillSwitchState {
  return normalizeRemoteVetoState(value, DAPP_SIGNING_FAMILIES);
}

export function isDappSigningPaused(family: DappSigningFamily, vetoes?: DappSigningVetoes): boolean {
  return vetoes?.[family] === true;
}

/** The family of a signing queue: the Substrate queue holds polkadot-js and WalletConnect `polkadot_*` requests. */
export function dappSigningFamilyOfQueue(kind: SigningRequestKind): DappSigningFamily {
  return kind === 'substrate' ? 'polkadot' : kind;
}

export const DAPP_SIGNING_PAUSED = 'dapp_signing_paused';

/**
 * What an approval refused by the kill switch returns to the popup. The request itself has already ended as the
 * person's Reject ends it, so the dApp gets the usual rejection.
 */
export class DappSigningPausedError extends Error {
  readonly code = DAPP_SIGNING_PAUSED;

  constructor(readonly family: DappSigningFamily) {
    super(`${DAPP_SIGNING_PAUSED}:${family}`);
    this.name = 'DappSigningPausedError';
  }
}

/** The paused family named by an error that crossed the message port, which carries only the message. */
export function pausedDappSigningFamily(error: unknown): DappSigningFamily | undefined {
  const message = error instanceof Error ? error.message : undefined;
  const family = message?.startsWith(`${DAPP_SIGNING_PAUSED}:`) ? message.slice(DAPP_SIGNING_PAUSED.length + 1) : '';

  return (DAPP_SIGNING_FAMILIES as readonly string[]).includes(family) ? (family as DappSigningFamily) : undefined;
}
