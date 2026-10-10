import { isSendCapabilityVetoed, type SendCapabilityVetoes } from '@/util/sendKillSwitch';

export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

export function isSolanaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS === 'true';
}

// Iroha transfers have no reviewed release codec: the Vite config refuses `true`
// in every build mode and the background refuses the transfer, so pickers and
// Send buttons must not offer Iroha networks either.
export function isIrohaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true';
}

// IrohaConnect signs dApp-supplied bytes without decoding them, so release
// builds keep it compiled off until decoded-payload signing ships. Only the
// exact reviewed `true` enables it, and the Vite config refuses that value in
// production mode.
export function isIrohaConnectEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_CONNECT === 'true';
}

// Bitcoin and Solana sends are compiled on for this release. The remote kill
// switch can only veto a compiled-on send; it can never enable one. Iroha sends
// stay compiled off.
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
  if (network?.ecosystem === 'iroha') return isIrohaTransfersEnabled();

  return true;
}

export function isGoogleDriveBackupEnabled(): boolean {
  return Boolean(process.env.OAUTH_CLIENT_ID?.trim());
}
