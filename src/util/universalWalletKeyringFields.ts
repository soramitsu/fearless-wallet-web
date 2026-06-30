import type { UniversalWalletKeyringLegacyFields } from '@/util/universalWalletKeyringMeta';
import { deriveBitcoinReceiveAddress } from '@/util/bitcoinKeyring';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { deriveSolanaAddress } from '@/util/solanaKeyring';
import { deriveTonAccount } from '@/util/tonKeyring';

type UniversalWalletDerivedKeyringFields = Required<
  Pick<
    UniversalWalletKeyringLegacyFields,
    | 'bitcoinAddress'
    | 'bitcoinTestnetAddress'
    | 'solanaAddress'
    | 'tonAddress'
    | 'tonPublicKeyHex'
    | 'irohaAddress'
    | 'irohaPublicKeyHex'
  >
>;

function deriveUniversalWalletKeyringFields(mnemonic: string): UniversalWalletDerivedKeyringFields {
  const ton = deriveTonAccount({ mnemonic });
  const iroha = deriveIrohaAddress({ mnemonic, network: 'taira' });

  return {
    bitcoinAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic }),
    bitcoinTestnetAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, network: 'testnet' }),
    solanaAddress: deriveSolanaAddress({ mnemonic }),
    tonAddress: ton.addressNonBounceable,
    tonPublicKeyHex: ton.publicKeyHex,
    irohaAddress: iroha.address,
    irohaPublicKeyHex: iroha.publicKeyHex,
  };
}

export { deriveUniversalWalletKeyringFields };
export type { UniversalWalletDerivedKeyringFields };
