import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { buildUniversalWalletKeyringMeta, validateUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import { WalletEcosystem } from '@/interfaces';

describe('Universal Wallet keyring field derivation', () => {
  it('derives active public keyring fields from Universal Wallet V2 vectors', () => {
    for (const vector of vectors.vectors) {
      const fields = deriveUniversalWalletKeyringFields(vector.mnemonic);
      const { bitcoin, solana, ton, iroha } = vector.expected;

      expect(fields).toEqual({
        bitcoinAddress: bitcoin.mainnet.firstReceiveAddress,
        bitcoinTestnetAddress: bitcoin.testnet.firstReceiveAddress,
        solanaAddress: solana.address,
        tonAddress: ton.addressNonBounceable,
        tonPublicKeyHex: ton.publicKeyHex,
        irohaAddress: iroha.taira.i105,
        irohaPublicKeyHex: iroha.taira.publicKeyHex,
      });

      const universalWallet = buildUniversalWalletKeyringMeta({
        address: vector.expected.substrate.polkadotAddress,
        meta: {
          ...fields,
          name: 'Fearless Universal',
          ethereumAddress: vector.expected.evm.address,
          walletEcosystem: WalletEcosystem.Substrate,
        },
        walletEcosystem: WalletEcosystem.Substrate,
        nowMillis: 1_710_000_000_000,
      });

      expect(universalWallet.status).toBe('active');
      expect(validateUniversalWalletKeyringMeta(universalWallet)).toEqual([]);
      expect(universalWallet.publicAccounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: 'ton-mainnet',
            ecosystem: WalletEcosystem.Ton,
            address: ton.addressNonBounceable,
            publicKeyHex: ton.publicKeyHex,
          }),
        ])
      );
    }
  });

  it('rejects malformed mnemonics before returning partial keyring fields', () => {
    expect(() => deriveUniversalWalletKeyringFields('abandon abandon abandon')).toThrow();
  });

  it('does not reuse TON testnet-only addresses for mainnet metadata', () => {
    const vector = vectors.vectors[0];
    const fields = deriveUniversalWalletKeyringFields(vector.mnemonic);

    expect(fields.tonAddress).toBe(vector.expected.ton.addressNonBounceable);
    expect(fields.tonAddress).not.toBe(vector.expected.ton.testnetNonBounceable);
    expect(fields.tonAddress.startsWith('UQ')).toBe(true);
  });
});
