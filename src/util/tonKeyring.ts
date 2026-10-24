import { keyPairFromSeed } from '@ton/crypto';
import { beginCell, type Address, Cell, contractAddress } from '@ton/core';
// The wallet contract alone: the package index also pulls in the HTTP clients (and zod), which the wallet does not use.
import { WalletContractV4 } from '@ton/ton/dist/wallets/WalletContractV4';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import * as tonWebMnemonic from 'tonweb-mnemonic';

import { UNIVERSAL_WALLET_DERIVATION_PATHS } from '@/consts/universalWallet';
import {
  bytesToHex,
  deriveSlip10Ed25519Seed,
  type Slip10Ed25519DerivationErrorCode,
} from '@/util/slip10Ed25519';

export const TON_DEFAULT_DERIVATION_PATH = UNIVERSAL_WALLET_DERIVATION_PATHS.tonDefault;
export const TON_DEFAULT_WORKCHAIN = 0;
export const TON_WALLET_VERSION = 'v4r2';

const TON_WALLET_V4R2_WALLET_ID_BASE = 698983191;
const TON_WALLET_V4R2_CODE = Cell.fromBase64(
  'te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA=='
);

type TonDerivationPayload = {
  mnemonic: string;
  path?: string;
  workchain?: number;
};

type TonDerivedAccount = {
  address: string;
  addressBounceable: string;
  addressNonBounceable: string;
  derivationPath: string;
  privateSeedHex: string;
  publicKey: Uint8Array;
  publicKeyHex: string;
  secretKey: Uint8Array;
  secretKeyHex: string;
  testnetNonBounceable: string;
  walletVersion: typeof TON_WALLET_VERSION;
  workchain: number;
};

type TonWalletV4R2StateInit = {
  address: Address;
  code: Cell;
  data: Cell;
  walletId: number;
};

export class TonKeyringError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'TonKeyringError';
  }
}

export function deriveTonAccount({
  mnemonic,
  path = TON_DEFAULT_DERIVATION_PATH,
  workchain = TON_DEFAULT_WORKCHAIN,
}: TonDerivationPayload): TonDerivedAccount {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);

  assertSupportedWorkchain(workchain);

  const privateSeed = deriveSlip10Ed25519Seed(mnemonicToSeedSync(normalizedMnemonic), path, createTonPathError);
  const { publicKey, secretKey } = keyPairFromSeed(Buffer.from(privateSeed));
  const publicKeyBytes = Uint8Array.from(publicKey);
  const secretKeyBytes = Uint8Array.from(secretKey);
  const { address } = createTonWalletV4R2StateInit(publicKeyBytes, workchain);
  const addressBounceable = address.toString({ bounceable: true, testOnly: false, urlSafe: true });
  const addressNonBounceable = address.toString({ bounceable: false, testOnly: false, urlSafe: true });

  return {
    address: addressNonBounceable,
    addressBounceable,
    addressNonBounceable,
    derivationPath: path,
    privateSeedHex: bytesToHex(privateSeed),
    publicKey: publicKeyBytes,
    publicKeyHex: bytesToHex(publicKeyBytes),
    secretKey: secretKeyBytes,
    secretKeyHex: bytesToHex(secretKeyBytes),
    testnetNonBounceable: address.toString({ bounceable: false, testOnly: true, urlSafe: true }),
    walletVersion: TON_WALLET_VERSION,
    workchain,
  };
}

export function deriveTonAddress(payload: TonDerivationPayload): string {
  return deriveTonAccount(payload).address;
}

// An existing account's public key determines its derivation. Some native TON
// phrases also pass BIP39 validation, so phrase shape alone cannot select a key.
export async function deriveCompatibleTonKeyPair(
  mnemonic: string[],
  expectedPublicKey?: Uint8Array,
  password?: string
): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
  const matches = (publicKey: Uint8Array) => !expectedPublicKey ||
    (publicKey.length === expectedPublicKey.length && publicKey.every((byte, index) => byte === expectedPublicKey[index]));
  // A wrong-password decrypt can yield ''. tonweb's HMAC rejects an empty phrase with a
  // WebCrypto DataError, so answer as for any other phrase that is not this account's.
  if (!mnemonic.some(Boolean)) throw new TonKeyringError(expectedPublicKey ? 'account_key_mismatch' : 'invalid_mnemonic');
  if (!password && validateMnemonic(mnemonic.join(' '))) {
    const universal = deriveTonAccount({ mnemonic: mnemonic.join(' ') });
    if (matches(universal.publicKey)) return universal;
  }
  let nativeTried = false;
  if (await tonWebMnemonic.validateMnemonic(mnemonic, password)) {
    nativeTried = true;
    const native = await tonWebMnemonic.mnemonicToKeyPair(mnemonic, password);
    if (matches(native.publicKey)) return native;
  }
  // Fearless 3.0.1-3.0.5 applied tonweb's KDF to every accepted phrase, including BIP39
  // phrases that fail TON's own validity check. Existing accounts only, exact key match only:
  // the words are replayed exactly as stored because tonweb hashes words.join(' ').
  if (expectedPublicKey && !nativeTried) {
    const legacy = await tonWebMnemonic.mnemonicToKeyPair(mnemonic, password);
    if (matches(legacy.publicKey)) return legacy;
  }
  throw new TonKeyringError(expectedPublicKey ? 'account_key_mismatch' : 'invalid_mnemonic');
}

// True when the words derive the stored public key under any derivation Fearless has shipped
// (universal, native TON or the 3.0.x legacy KDF). The words are used exactly as given, so
// callers decide which spacing/case candidates to try.
export async function verifyTonPhrase(words: string[], publicKey: Uint8Array): Promise<boolean> {
  try {
    await deriveCompatibleTonKeyPair(words, publicKey);

    return true;
  } catch (error) {
    if (error instanceof TonKeyringError) return false;

    throw error;
  }
}

// How a typed phrase becomes a TON key. `universal` is the Universal Wallet path for BIP39 phrases,
// `native` is TON's own KDF for phrases that pass TON's validity check, `fearless-legacy` is that
// same KDF applied to a BIP39 phrase that fails the check, as Fearless 3.0.1-3.0.5 for Chrome and the
// Android app did, and `as-typed` is that KDF over the text exactly as typed, spacing and capitals
// included, as the Android app derived and stored every TON phrase.
export const TON_IMPORT_DERIVATIONS = ['universal', 'native', 'fearless-legacy', 'as-typed'] as const;

export type TonImportDerivation = (typeof TON_IMPORT_DERIVATIONS)[number];

export type TonImportCandidate = {
  derivation: TonImportDerivation;
  address: string;
  /** The text stored for this address: the tidied phrase, or for `as-typed` the text as typed. */
  phrase: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

// The address the user picked on the import screen, and the derivation that opens it.
export type TonImportChoice = Pick<TonImportCandidate, 'derivation' | 'address'>;

// A pasted phrase may carry line breaks, repeated spaces or capitals. Fearless for Chrome never accepted
// such input, so the tidied phrase is the one 3.0.x stored; text the Android app stored as typed is
// offered separately as `as-typed`.
export function normalizeTonImportPhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ').toLowerCase();
}

// The typed text as the Android app would have stored it: only the line breaks a copy and paste adds
// at either end are dropped.
export function tonImportTextAsTyped(text: string): string {
  return text.replace(/^[\r\n]+|[\r\n]+$/g, '');
}

// True for a stored TON phrase that only opens when typed exactly, with its own spacing and capitals.
export function isTonPhraseIrregular(phrase: string): boolean {
  return normalizeTonImportPhrase(phrase) !== phrase;
}

// Every TON address a newly typed phrase can open, the address new wallets get first. Fearless
// 3.0.1-3.0.5 and the Android app ran tonweb's KDF over every phrase they accepted, so a BIP39 phrase
// opens the universal address and the one they stored for it, and a phrase only TON accepts opens
// the native address. Text that differs from the tidied phrase also opens the address the Android app
// derived from it as typed. Empty when the tidied phrase is neither BIP39 nor TON.
export async function deriveTonImportCandidates(text: string): Promise<TonImportCandidate[]> {
  const phrase = normalizeTonImportPhrase(text);

  if (!phrase) return [];

  const words = phrase.split(' ');
  const isBip39 = validateMnemonic(phrase);
  const isNative = await tonWebMnemonic.validateMnemonic(words);

  if (!isBip39 && !isNative) return [];

  const candidates: TonImportCandidate[] = [];
  const add = (
    derivation: TonImportDerivation,
    stored: string,
    { publicKey, secretKey }: { publicKey: Uint8Array; secretKey: Uint8Array }
  ) => {
    const address = toTonImportAddress(publicKey);

    if (!candidates.some((candidate) => candidate.address === address)) {
      candidates.push({
        derivation,
        address,
        phrase: stored,
        publicKey: Uint8Array.from(publicKey),
        secretKey: Uint8Array.from(secretKey),
      });
    }
  };
  const asTyped = tonImportTextAsTyped(text);

  if (isBip39) add('universal', phrase, deriveTonAccount({ mnemonic: phrase }));
  add(isNative ? 'native' : 'fearless-legacy', phrase, await tonWebMnemonic.mnemonicToKeyPair(words));
  if (asTyped !== phrase) add('as-typed', asTyped, await tonWebMnemonic.mnemonicToKeyPair(asTyped.split(' ')));

  return candidates;
}

// The key for the address the user picked. Refuses a derivation the phrase does not have and an
// address the derivation does not open, so the account that is saved is the one that was shown.
export async function deriveTonImportChoice(text: string, choice: TonImportChoice): Promise<TonImportCandidate> {
  const candidates = await deriveTonImportCandidates(text);
  const candidate = candidates.find(({ derivation }) => derivation === choice.derivation);

  if (!candidate) throw new TonKeyringError(candidates.length ? 'unsupported_ton_derivation' : 'invalid_mnemonic');
  if (candidate.address !== choice.address) throw new TonKeyringError('account_key_mismatch');

  return candidate;
}

function toTonImportAddress(publicKey: Uint8Array): string {
  return createTonWalletV4R2StateInit(publicKey, TON_DEFAULT_WORKCHAIN).address.toString({
    bounceable: false,
    testOnly: false,
    urlSafe: true,
  });
}

export function createTonWalletContractV4R2(
  publicKey: Uint8Array,
  workchain = TON_DEFAULT_WORKCHAIN
): WalletContractV4 {
  const { address, code, data, walletId } = createTonWalletV4R2StateInit(publicKey, workchain);
  const wallet = Object.create(WalletContractV4.prototype) as WalletContractV4;
  const mutableWallet = wallet as unknown as {
    address: Address;
    init: { code: Cell; data: Cell };
    publicKey: Buffer;
    walletId: number;
    workchain: number;
  };

  mutableWallet.address = address;
  mutableWallet.init = { code, data };
  mutableWallet.publicKey = Buffer.from(publicKey);
  mutableWallet.walletId = walletId;
  mutableWallet.workchain = workchain;

  return wallet;
}

function normalizeMnemonic(mnemonic: string): string {
  const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, ' ');

  if (!validateMnemonic(normalizedMnemonic)) throw new TonKeyringError('invalid_mnemonic');

  return normalizedMnemonic;
}

function createTonPathError(code: Slip10Ed25519DerivationErrorCode): TonKeyringError {
  return new TonKeyringError(code);
}

function assertSupportedWorkchain(workchain: number): void {
  if (workchain !== TON_DEFAULT_WORKCHAIN) throw new TonKeyringError('unsupported_workchain');
}

function createTonWalletV4R2StateInit(publicKey: Uint8Array, workchain: number): TonWalletV4R2StateInit {
  assertSupportedWorkchain(workchain);

  const data = beginCell().storeUint(0, 32).storeUint(TON_WALLET_V4R2_WALLET_ID_BASE + workchain, 32);

  for (const byte of publicKey) {
    data.storeUint(byte, 8);
  }

  const dataCell = data.storeBit(0).endCell();

  return {
    address: contractAddress(workchain, {
      code: TON_WALLET_V4R2_CODE,
      data: dataCell,
    }),
    code: TON_WALLET_V4R2_CODE,
    data: dataCell,
    walletId: TON_WALLET_V4R2_WALLET_ID_BASE + workchain,
  };
}

export { type TonDerivedAccount, type TonDerivationPayload };
