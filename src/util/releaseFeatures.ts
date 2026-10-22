export function isBitcoinTransfersEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true';
}

export function isNetworkTransferEnabled(network: { ecosystem?: string } | null | undefined): boolean {
  return network?.ecosystem !== 'bitcoin' || isBitcoinTransfersEnabled();
}

export function isGoogleDriveBackupEnabled(): boolean {
  return Boolean(process.env.OAUTH_CLIENT_ID?.trim());
}
