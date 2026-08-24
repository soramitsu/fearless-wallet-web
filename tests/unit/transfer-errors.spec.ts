import { getTransferErrorLocaleKey } from '@/helpers/transferErrors';

describe('transfer error locale mapping', () => {
  it('maps known fail-closed transfer errors to specific UI messages', () => {
    expect(getTransferErrorLocaleKey('bitcoin_transfer_disabled')).toBe('assets.bitcoinTransfersDisabled');
    expect(getTransferErrorLocaleKey('iroha_transfer_disabled')).toBe('assets.irohaTransfersDisabled');
    expect(getTransferErrorLocaleKey('iroha_transfer_protocol_mismatch')).toBe('assets.irohaProtocolTestOnly');
    expect(getTransferErrorLocaleKey('unsupported_solana_asset')).toBe('assets.unsupportedSolanaTokenTransfer');
  });

  it('falls back to the generic fee error for unknown or missing transfer errors', () => {
    expect(getTransferErrorLocaleKey(undefined)).toBe('estimateFeeError');
    expect(getTransferErrorLocaleKey('invalid_iroha_amount')).toBe('estimateFeeError');
  });
});
