// Bitcoin and Solana send outcomes the background reports by code, shared by
// the Send screen (quote errors) and the result screen (send failures).
export const SEND_ERROR_LOCALE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  bitcoin_amount_below_dust: 'assets.bitcoinAmountBelowDust',
  bitcoin_broadcast_ambiguous: 'assets.bitcoinBroadcastUnconfirmed',
  bitcoin_broadcast_rejected: 'assets.bitcoinBroadcastRejected',
  bitcoin_insufficient_spendable: 'assets.bitcoinInsufficientSpendable',
  bitcoin_previous_send_pending: 'assets.bitcoinPreviousSendPending',
  bitcoin_previous_send_unconfirmed: 'assets.bitcoinPreviousSendUnconfirmed',
  bitcoin_too_many_inputs: 'assets.bitcoinTooManyInputs',
  invalid_bitcoin_recipient: 'assets.incorrectAddress',
  invalid_solana_recipient: 'assets.incorrectAddress',
  solana_amount_below_rent: 'assets.solanaAmountBelowRent',
  solana_broadcast_ambiguous: 'assets.solanaBroadcastUnconfirmed',
  solana_broadcast_signature_mismatch: 'assets.solanaBroadcastUnconfirmed',
  solana_insufficient_funds: 'assets.insufficientBalanceGeneric',
  solana_insufficient_sol_for_fee: 'assets.solanaInsufficientSolForFee',
  solana_insufficient_token_balance: 'assets.insufficientBalanceGeneric',
  solana_previous_send_pending: 'assets.solanaPreviousSendPending',
  solana_previous_send_unverified: 'assets.solanaPreviousSendUnverified',
  solana_recipient_off_curve: 'assets.solanaRecipientOffCurve',
  solana_recipient_program: 'assets.solanaRecipientProgram',
  solana_recipient_token_account: 'assets.solanaRecipientTokenAccount',
  solana_recipient_token_account_frozen: 'assets.solanaRecipientTokenAccountFrozen',
  solana_sender_below_rent: 'assets.solanaSenderBelowRent',
  solana_simulation_failed: 'assets.solanaSimulationFailed',
  solana_transaction_expired: 'assets.solanaTransactionExpired',
  solana_transaction_failed: 'assets.solanaTransactionFailed',
  solana_transfer_disabled: 'common.featureOff',
});

// The account is in the wallet but its key waits for a password or phrase (Account access). Every screen
// that shows one of these offers "Unlock this account".
export const ACCOUNT_ACCESS_ERROR_LOCALE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  legacy_password_required: 'migration.legacyPasswordRequired',
  previous_password_required: 'accountAccess.previousPasswordRequired',
  ton_seed_needs_previous_password: 'accountAccess.previousPasswordRequired',
});

/** The message key for an Account access error, or undefined for any other error. */
export function getAccountAccessErrorLocaleKey(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;

  return message ? ACCOUNT_ACCESS_ERROR_LOCALE_KEYS[message] : undefined;
}

const TRANSFER_ERROR_LOCALE_KEYS: Record<string, string> = {
  ...SEND_ERROR_LOCALE_KEYS,
  transfer_fee_changed: 'assets.transferFeeChanged',
  transfer_fee_approval_required: 'assets.transferFeeApprovalRequired',
  // An EVM send whose populated transaction carries no fee to compare with the reviewed one. Nothing was sent.
  transfer_fee_unavailable: 'assets.transferFeeApprovalRequired',
  ...ACCOUNT_ACCESS_ERROR_LOCALE_KEYS,
  bitcoin_transfer_disabled: 'assets.bitcoinTransfersDisabled',
  iroha_transfer_disabled: 'assets.irohaTransfersDisabled',
  // A reset or upgraded Iroha network needs a wallet release pinned to it.
  iroha_network_reset: 'assets.irohaTransfersDisabled',
  iroha_network_identity_unavailable: 'assets.irohaTransfersDisabled',
  iroha_node_protocol_unsupported: 'assets.irohaTransfersDisabled',
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
  cross_chain_runtime_not_reviewed: 'assets.crossChainRouteUnavailable',
  cross_chain_runtime_call_index_mismatch: 'assets.crossChainRouteUnavailable',
  // An earlier send of this route may still be included; sending again could move the funds twice.
  cross_chain_previous_send_unresolved: 'assets.transactionStatusUnknown',
  cross_chain_send_in_progress: 'assets.transactionPending',
};

// The generic message; a fee quote that fails with it can simply be asked again.
const ESTIMATE_FEE_ERROR = 'common.estimateFeeError';

function getTransferErrorLocaleKey(message: string | undefined): string {
  if (!message) return ESTIMATE_FEE_ERROR;

  return TRANSFER_ERROR_LOCALE_KEYS[message] ?? ESTIMATE_FEE_ERROR;
}

export { ESTIMATE_FEE_ERROR };

export { getTransferErrorLocaleKey };
