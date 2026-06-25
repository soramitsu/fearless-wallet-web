import { base58Encode, ed25519PairFromSeed, ed25519Sign, ed25519Verify } from '@polkadot/util-crypto';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';

import { UNIVERSAL_WALLET_DERIVATION_PATHS } from '@/consts/universalWallet';
import {
  bytesToHex,
  deriveSlip10Ed25519Seed,
  hexToBytes,
  type Slip10Ed25519DerivationErrorCode,
} from '@/util/slip10Ed25519';

const MAX_SOLANA_SIGN_MESSAGE_BYTES = 64 * 1024;

export const SOLANA_DEFAULT_DERIVATION_PATH = UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault;

type SolanaDerivationPayload = {
  mnemonic: string;
  path?: string;
};

type SolanaSignPayload = SolanaDerivationPayload & {
  message: string | Uint8Array;
};

type SolanaDerivedAccount = {
  address: string;
  derivationPath: string;
  privateSeedHex: string;
  publicKey: Uint8Array;
  publicKeyHex: string;
};

type SolanaSignatureResult = Omit<SolanaDerivedAccount, 'privateSeedHex'> & {
  message: Uint8Array;
  signature: Uint8Array;
  signatureBase58: string;
  signatureHex: string;
};

export class SolanaKeyringError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'SolanaKeyringError';
  }
}

export function deriveSolanaAccount({
  mnemonic,
  path = SOLANA_DEFAULT_DERIVATION_PATH,
}: SolanaDerivationPayload): SolanaDerivedAccount {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const privateSeed = deriveSlip10Ed25519Seed(mnemonicToSeedSync(normalizedMnemonic), path, createSolanaPathError);
  const { publicKey } = ed25519PairFromSeed(privateSeed);

  return {
    address: base58Encode(publicKey),
    derivationPath: path,
    privateSeedHex: bytesToHex(privateSeed),
    publicKey,
    publicKeyHex: bytesToHex(publicKey),
  };
}

export function deriveSolanaAddress(payload: SolanaDerivationPayload): string {
  return deriveSolanaAccount(payload).address;
}

export function signSolanaMessage({ message, ...payload }: SolanaSignPayload): SolanaSignatureResult {
  const account = deriveSolanaAccount(payload);
  const normalizedMessage = normalizeMessage(message);
  const pair = ed25519PairFromSeed(hexToBytes(account.privateSeedHex));
  const signature = ed25519Sign(normalizedMessage, pair);

  return {
    address: account.address,
    derivationPath: account.derivationPath,
    message: normalizedMessage,
    publicKey: account.publicKey,
    publicKeyHex: account.publicKeyHex,
    signature,
    signatureBase58: base58Encode(signature),
    signatureHex: bytesToHex(signature),
  };
}

export function verifySolanaMessageSignature({
  message,
  publicKey,
  signature,
}: {
  message: string | Uint8Array;
  publicKey: Uint8Array;
  signature: Uint8Array;
}): boolean {
  return ed25519Verify(normalizeMessage(message), signature, publicKey);
}

function normalizeMnemonic(mnemonic: string): string {
  const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, ' ');

  if (!validateMnemonic(normalizedMnemonic)) throw new SolanaKeyringError('invalid_mnemonic');

  return normalizedMnemonic;
}

function normalizeMessage(message: string | Uint8Array): Uint8Array {
  const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : new Uint8Array(message);

  if (bytes.length === 0) throw new SolanaKeyringError('empty_message');
  if (bytes.length > MAX_SOLANA_SIGN_MESSAGE_BYTES) throw new SolanaKeyringError('message_too_large');

  return bytes;
}

function createSolanaPathError(code: Slip10Ed25519DerivationErrorCode): SolanaKeyringError {
  return new SolanaKeyringError(code);
}

export {
  type SolanaDerivedAccount,
  type SolanaDerivationPayload,
  type SolanaSignatureResult,
  type SolanaSignPayload,
};
