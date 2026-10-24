import { getAccountAccessErrorLocaleKey, getTransferErrorLocaleKey } from '@/helpers/transferErrors';

describe('transfer error locale mapping', () => {
  it('maps known fail-closed transfer errors to specific UI messages', () => {
    expect(getTransferErrorLocaleKey('bitcoin_transfer_disabled')).toBe('assets.bitcoinTransfersDisabled');
    expect(getTransferErrorLocaleKey('iroha_transfer_disabled')).toBe('assets.irohaTransfersDisabled');
    expect(getTransferErrorLocaleKey('unsupported_solana_asset')).toBe('assets.unsupportedSolanaTokenTransfer');
  });

  it('names a key that waits for a password instead of a generic fee error', () => {
    expect(getTransferErrorLocaleKey('legacy_password_required')).toBe('migration.legacyPasswordRequired');
    expect(getTransferErrorLocaleKey('previous_password_required')).toBe('accountAccess.previousPasswordRequired');
    expect(getTransferErrorLocaleKey('ton_seed_needs_previous_password')).toBe(
      'accountAccess.previousPasswordRequired'
    );
    expect(getAccountAccessErrorLocaleKey(new Error('legacy_password_required'))).toBe(
      'migration.legacyPasswordRequired'
    );
    expect(getAccountAccessErrorLocaleKey(new Error('ton_seed_needs_previous_password'))).toBe(
      'accountAccess.previousPasswordRequired'
    );
    expect(getAccountAccessErrorLocaleKey(new Error('wrong_password'))).toBeUndefined();
    expect(getAccountAccessErrorLocaleKey(undefined)).toBeUndefined();
  });

  it('keeps a route whose earlier send is unresolved or still running from being offered', () => {
    expect(getTransferErrorLocaleKey('cross_chain_previous_send_unresolved')).toBe('assets.transactionStatusUnknown');
    expect(getTransferErrorLocaleKey('cross_chain_send_in_progress')).toBe('assets.transactionPending');
  });

  it('explains a route refused because its runtime is not a reviewed one', () => {
    expect(getTransferErrorLocaleKey('cross_chain_runtime_not_reviewed')).toBe('assets.crossChainRouteUnavailable');
    expect(getTransferErrorLocaleKey('cross_chain_runtime_call_index_mismatch')).toBe('assets.crossChainRouteUnavailable');
  });

  it('falls back to the generic fee error for unknown or missing transfer errors', () => {
    expect(getTransferErrorLocaleKey(undefined)).toBe('estimateFeeError');
    expect(getTransferErrorLocaleKey('invalid_iroha_amount')).toBe('estimateFeeError');
  });
});
