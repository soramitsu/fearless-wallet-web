import { isSendCapabilityVetoed, type SendCapabilityVetoes } from '@/util/sendKillSwitch';

export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

/**
 * Solana sends ship enabled. The flag exists so the compiled-off path stays testable and so the veto-only remote
 * kill switch has something to combine with; the 3.0.x build configuration does not define it, so a release build
 * always reads it as enabled. Nothing remote can turn a compiled-off send on.
 */
export function isSolanaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS !== 'false';
}

export function isNetworkTransferEnabled(
  network: { ecosystem?: string } | null | undefined,
  vetoes?: SendCapabilityVetoes
): boolean {
  if (network?.ecosystem === 'solana') {
    return isSolanaTransfersEnabled() && !isSendCapabilityVetoed('solanaSend', vetoes);
  }

  return network?.ecosystem !== 'bitcoin' || isBitcoinTransfersEnabled();
}

export function isGoogleDriveBackupEnabled(): boolean {
  return Boolean(process.env.OAUTH_CLIENT_ID?.trim());
}
