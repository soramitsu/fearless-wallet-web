import { isSendCapabilityVetoed, type SendCapabilityVetoes } from '@/util/sendKillSwitch';

export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

export function isSolanaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS === 'true';
}

// IrohaConnect signs dApp-supplied bytes without decoding them, so release
// builds keep it compiled off until decoded-payload signing ships. Only the
// exact reviewed `true` enables it, and the Vite config refuses that value in
// production mode.
export function isIrohaConnectEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_CONNECT === 'true';
}

// Bitcoin and Solana sends are compiled on for this release. The remote kill
// switch can only veto a compiled-on send; it can never enable one.
export function isNetworkTransferEnabled(
  network: { ecosystem?: string } | null | undefined,
  vetoes?: SendCapabilityVetoes
): boolean {
  if (network?.ecosystem === 'bitcoin') {
    return isBitcoinTransfersEnabled() && !isSendCapabilityVetoed('bitcoinSend', vetoes);
  }
  if (network?.ecosystem === 'solana') {
    return isSolanaTransfersEnabled() && !isSendCapabilityVetoed('solanaSend', vetoes);
  }

  return true;
}

export function isGoogleDriveBackupEnabled(): boolean {
  return Boolean(process.env.OAUTH_CLIENT_ID?.trim());
}
