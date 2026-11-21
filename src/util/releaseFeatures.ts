import { isSendCapabilityVetoed, type SendCapabilityVetoes } from '@/util/sendKillSwitch';

export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

export function isSolanaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS !== 'false';
}

// Production builds enable Iroha only when reviewed transfer evidence is ready.
export function isIrohaTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true';
}

// IrohaConnect ships enabled: every dApp transaction is decoded, rebuilt byte for byte and shown before the account
// key signs its hash, and raw requests are never signed with the account key. An explicit build-time `false` still
// compiles it off as a kill switch.
export function isIrohaConnectEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_CONNECT !== 'false';
}

// Bitcoin and Solana sends are compiled on for this release. The remote kill
// switch can only veto a compiled-on send; it can never enable one. Iroha sends
// follow the reviewed release evidence.
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
