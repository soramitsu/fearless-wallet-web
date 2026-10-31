import type { UniversalWalletKeyringLegacyFields } from '@/util/universalWalletKeyringMeta';
import { deriveBitcoinReceiveAddress } from '@/util/bitcoinKeyring';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { deriveSolanaAddress } from '@/util/solanaKeyring';
import { deriveTonAccount } from '@/util/tonKeyring';
import { UNIVERSAL_WALLET_PASSWORD_NETWORKS, type UniversalWalletPasswordNetwork } from '@/util/universalWalletPassphrase';

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

type UniversalWalletNetworkFields = Partial<UniversalWalletDerivedKeyringFields>;

const networkFields: Record<
  UniversalWalletPasswordNetwork,
  { keys: (keyof UniversalWalletDerivedKeyringFields)[]; derive: (mnemonic: string, passphrase: string) => UniversalWalletNetworkFields }
> = {
  bitcoin: {
    keys: ['bitcoinAddress'],
    derive: (mnemonic, passphrase) => ({ bitcoinAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, passphrase }) }),
  },
  bitcoinTestnet: {
    keys: ['bitcoinTestnetAddress'],
    derive: (mnemonic, passphrase) => ({
      bitcoinTestnetAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, network: 'testnet', passphrase }),
    }),
  },
  solana: {
    keys: ['solanaAddress'],
    derive: (mnemonic, passphrase) => ({ solanaAddress: deriveSolanaAddress({ mnemonic, passphrase }) }),
  },
  ton: {
    keys: ['tonAddress', 'tonPublicKeyHex'],
    derive: (mnemonic, passphrase) => {
      const ton = deriveTonAccount({ mnemonic, passphrase });

      return { tonAddress: ton.addressNonBounceable, tonPublicKeyHex: ton.publicKeyHex };
    },
  },
  iroha: {
    keys: ['irohaAddress', 'irohaPublicKeyHex'],
    derive: (mnemonic, passphrase) => {
      const iroha = deriveIrohaAddress({ mnemonic, network: 'taira', passphrase });

      return { irohaAddress: iroha.address, irohaPublicKeyHex: iroha.publicKeyHex };
    },
  },
};

/** The keyring meta fields of one Universal Wallet network, derived with the given passphrase. */
function deriveUniversalWalletNetworkFields(
  network: UniversalWalletPasswordNetwork,
  mnemonic: string,
  passphrase = ''
): UniversalWalletNetworkFields {
  return networkFields[network].derive(mnemonic, passphrase);
}

function universalWalletNetworkKeys(network: UniversalWalletPasswordNetwork): (keyof UniversalWalletDerivedKeyringFields)[] {
  return networkFields[network].keys;
}

/**
 * Every Universal Wallet account of a phrase. A wallet password is the BIP39 passphrase; networks listed in
 * `legacyNetworks` keep the account the words alone open (a funded address an earlier version showed).
 */
function deriveUniversalWalletKeyringFields(
  mnemonic: string,
  passphrase = '',
  legacyNetworks: readonly UniversalWalletPasswordNetwork[] = []
): UniversalWalletDerivedKeyringFields {
  return Object.assign(
    {},
    ...UNIVERSAL_WALLET_PASSWORD_NETWORKS.map((network) =>
      deriveUniversalWalletNetworkFields(network, mnemonic, legacyNetworks.includes(network) ? '' : passphrase)
    )
  ) as UniversalWalletDerivedKeyringFields;
}

export { deriveUniversalWalletKeyringFields, deriveUniversalWalletNetworkFields, universalWalletNetworkKeys };
export type { UniversalWalletDerivedKeyringFields, UniversalWalletNetworkFields };
