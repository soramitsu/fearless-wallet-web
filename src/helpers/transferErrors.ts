const TRANSFER_ERROR_LOCALE_KEYS: Record<string, string> = {
  iroha_transfer_disabled: 'assets.irohaTransfersDisabled',
  unsupported_solana_asset: 'assets.unsupportedSolanaTokenTransfer',
};

function getTransferErrorLocaleKey(message: string | undefined): string {
  if (!message) return 'estimateFeeError';

  return TRANSFER_ERROR_LOCALE_KEYS[message] ?? 'estimateFeeError';
}

export { getTransferErrorLocaleKey };
