const TRANSFER_ERROR_LOCALE_KEYS: Record<string, string> = {
  bitcoin_transfer_disabled: 'assets.bitcoinTransfersDisabled',
  iroha_transfer_disabled: 'assets.irohaTransfersDisabled',
  iroha_transfer_protocol_mismatch: 'assets.irohaProtocolTestOnly',
  unsupported_solana_asset: 'assets.unsupportedSolanaTokenTransfer',
  cross_chain_network_unavailable: 'assets.crossChainRuntimeUnavailable',
  cross_chain_runtime_unavailable: 'assets.crossChainRuntimeUnavailable',
  cross_chain_provider_temporarily_disabled: 'assets.crossChainProviderDisabled',
  cross_chain_signable_account_required: 'assets.crossChainSignableAccountRequired',
  cross_chain_mobile_signer_mismatch: 'assets.crossChainSignableAccountRequired',
  cross_chain_amount_below_reviewed_minimum: 'assets.crossChainAmountBelowMinimum',
  cross_chain_amount_below_runtime_minimum: 'assets.crossChainAmountBelowMinimum',
  cross_chain_runtime_capability_missing: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_execution_drift: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_genesis_mismatch: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_minimum_unavailable: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_registration_drift: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_registration_missing: 'assets.crossChainRouteUnavailable',
};

function getTransferErrorLocaleKey(message: string | undefined): string {
  if (!message) return 'estimateFeeError';

  return TRANSFER_ERROR_LOCALE_KEYS[message] ?? 'estimateFeeError';
}

export { getTransferErrorLocaleKey };
