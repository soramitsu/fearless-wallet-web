import { getTransferErrorLocaleKey } from '@/helpers/transferErrors';

describe('transfer error locale mapping', () => {
  it('maps known fail-closed transfer errors to specific UI messages', () => {
    expect(getTransferErrorLocaleKey('bitcoin_transfer_disabled')).toBe('assets.bitcoinTransfersDisabled');
    expect(getTransferErrorLocaleKey('iroha_transfer_disabled')).toBe('assets.irohaTransfersDisabled');
    expect(getTransferErrorLocaleKey('unsupported_solana_asset')).toBe('assets.unsupportedSolanaTokenTransfer');
  });

  it('maps every Solana send outcome to a specific message', () => {
    expect(getTransferErrorLocaleKey('solana_recipient_program')).toBe('assets.solanaRecipientProgram');
    expect(getTransferErrorLocaleKey('solana_recipient_token_account')).toBe('assets.solanaRecipientTokenAccount');
    expect(getTransferErrorLocaleKey('solana_amount_below_rent')).toBe('assets.solanaAmountBelowRent');
    expect(getTransferErrorLocaleKey('solana_previous_send_pending')).toBe('assets.solanaPreviousSendPending');
    expect(getTransferErrorLocaleKey('solana_insufficient_sol_for_fee')).toBe('assets.solanaInsufficientSolForFee');
    expect(getTransferErrorLocaleKey('solana_transfer_disabled')).toBe('common.featureOff');
  });

  it('falls back to the generic fee error for unknown or missing transfer errors', () => {
    expect(getTransferErrorLocaleKey(undefined)).toBe('estimateFeeError');
    expect(getTransferErrorLocaleKey('invalid_iroha_amount')).toBe('estimateFeeError');
  });
});
