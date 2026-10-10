export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

// IrohaConnect signs dApp-supplied bytes without decoding them, so release
// builds keep it compiled off until decoded-payload signing ships. Only the
// exact reviewed `true` enables it, and the Vite config refuses that value in
// production mode.
export function isIrohaConnectEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_CONNECT === 'true';
}

export function isNetworkTransferEnabled(network: { ecosystem?: string } | null | undefined): boolean {
  return network?.ecosystem !== 'bitcoin' || isBitcoinTransfersEnabled();
}

export function isGoogleDriveBackupEnabled(): boolean {
  return Boolean(process.env.OAUTH_CLIENT_ID?.trim());
}
