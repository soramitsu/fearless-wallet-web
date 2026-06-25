import { keyPairFromSeed } from '@ton/crypto';
import { beginCell, type Address, Cell, contractAddress } from '@ton/core';
import { WalletContractV4 } from '@ton/ton';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';

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
