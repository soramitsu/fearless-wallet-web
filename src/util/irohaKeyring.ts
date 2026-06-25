import { keyPairFromSeed } from '@ton/crypto';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { UNIVERSAL_WALLET_DERIVATION_PATHS } from '@/consts/universalWallet';
import { encodeIrohaI105Address, getIrohaCanonicalHex, type IrohaNetworkInput } from '@/util/iroha';
import {
  bytesToHex,
  deriveSlip10Ed25519Seed,
  type Slip10Ed25519DerivationErrorCode,
} from '@/util/slip10Ed25519';

export const IROHA_DEFAULT_DERIVATION_PATH = UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault;

type IrohaDerivationPayload = {
  mnemonic: string;
  path?: string;
};

type IrohaAddressDerivationPayload = IrohaDerivationPayload & {
  network?: IrohaNetworkInput;
};

type IrohaDerivedAccount = {
  derivationPath: string;
  publicKeyHex: string;
  canonicalHex: string;
};

type IrohaDerivedSigningKey = IrohaDerivedAccount & {
  privateKeySeed: Uint8Array;
};

type IrohaDerivedAddress = IrohaDerivedAccount & {
  address: string;
};

export const deriveIrohaSigningKey = ({
  mnemonic,
  path = IROHA_DEFAULT_DERIVATION_PATH,
}: IrohaDerivationPayload): IrohaDerivedSigningKey => {
  const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, ' ');

  if (!validateMnemonic(normalizedMnemonic)) throw new Error('Invalid Iroha mnemonic');

  const seed = mnemonicToSeedSync(normalizedMnemonic);
  const privateSeed = deriveSlip10Ed25519Seed(seed, path, createIrohaPathError);
  const publicKeyHex = bytesToHex(keyPairFromSeed(Buffer.from(privateSeed)).publicKey);

  return {
    derivationPath: path,
    privateKeySeed: privateSeed,
    publicKeyHex,
    canonicalHex: getIrohaCanonicalHex(publicKeyHex),
  };
};

export const deriveIrohaAccount = (payload: IrohaDerivationPayload): IrohaDerivedAccount => {
  const { privateKeySeed: _privateKeySeed, ...account } = deriveIrohaSigningKey(payload);

  return account;
};

export const deriveIrohaAddress = ({
  mnemonic,
  path,
  network = 'taira',
}: IrohaAddressDerivationPayload): IrohaDerivedAddress => {
  const account = deriveIrohaAccount({ mnemonic, path });

  return {
    ...account,
    address: encodeIrohaI105Address(account.publicKeyHex, network),
  };
};

function createIrohaPathError(code: Slip10Ed25519DerivationErrorCode): Error {
  if (code === 'invalid_derivation_path') return new Error('Invalid Iroha derivation path');
  if (code === 'non_hardened_derivation_path') {
    return new Error('Iroha derivation path must use hardened segments only');
  }

  return new Error('Invalid Iroha derivation path index');
}
