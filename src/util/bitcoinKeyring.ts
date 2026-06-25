import { bech32 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { mnemonicToSeedSync } from 'bip39';
import type { KeypairType } from '@subwallet/keyring/types';

export const BITCOIN_MAINNET_FIRST_RECEIVE_PATH = "m/84'/0'/0'/0/0";
export const BITCOIN_TESTNET_FIRST_RECEIVE_PATH = "m/84'/1'/0'/0/0";
export const BITCOIN_MAINNET_KEYPAIR_TYPE = 'bitcoin-84' as KeypairType;
export const BITCOIN_TESTNET_KEYPAIR_TYPE = 'bittest-84' as KeypairType;

export type BitcoinDerivationNetwork = 'mainnet' | 'testnet';

export type BitcoinDerivedKey = {
  address: string;
  path: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

const networkDefaults = {
  mainnet: {
    keypairType: BITCOIN_MAINNET_KEYPAIR_TYPE,
    path: BITCOIN_MAINNET_FIRST_RECEIVE_PATH,
  },
  testnet: {
    keypairType: BITCOIN_TESTNET_KEYPAIR_TYPE,
    path: BITCOIN_TESTNET_FIRST_RECEIVE_PATH,
  },
} satisfies Record<BitcoinDerivationNetwork, { keypairType: KeypairType; path: string }>;

const normalizeDerivationPath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);
const assertBip32Index = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff) throw new Error(`Invalid Bitcoin ${label} index`);
};

export const getBitcoinKeypairType = (network: BitcoinDerivationNetwork = 'mainnet'): KeypairType =>
  networkDefaults[network].keypairType;

export const getBitcoinFirstReceivePath = (network: BitcoinDerivationNetwork = 'mainnet'): string =>
  networkDefaults[network].path;

export const getBitcoinReceivePath = (
  network: BitcoinDerivationNetwork = 'mainnet',
  index = 0,
  change = 0
): string => {
  assertBip32Index(index, 'receive');
  if (change !== 0 && change !== 1) throw new Error('Invalid Bitcoin change index');

  const coinType = network === 'mainnet' ? 0 : 1;

  return `m/84'/${coinType}'/0'/${change}/${index}`;
};

export const buildBitcoinReceiveSuri = ({
  mnemonicOrSeed,
  network = 'mainnet',
  path,
}: {
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  path?: string;
}): string => `${mnemonicOrSeed.trim()}${normalizeDerivationPath(path ?? getBitcoinFirstReceivePath(network))}`;

const hash160 = (value: Uint8Array): Uint8Array => ripemd160(sha256(value));

const deriveKey = (mnemonicOrSeed: string, path: string): { privateKey: Uint8Array; publicKey: Uint8Array } => {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonicOrSeed.trim()));
  const child = root.derive(path);

  if (!child.publicKey) throw new Error(`Unable to derive Bitcoin public key for path ${path}`);
  if (!child.privateKey) throw new Error(`Unable to derive Bitcoin private key for path ${path}`);

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
  };
};

const encodeP2wpkhAddress = (publicKey: Uint8Array, network: BitcoinDerivationNetwork): string =>
  bech32.encode(network === 'mainnet' ? 'bc' : 'tb', [0, ...bech32.toWords(hash160(publicKey))]);

export const deriveBitcoinKey = ({
  mnemonicOrSeed,
  network = 'mainnet',
  path,
}: {
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  path?: string;
}): BitcoinDerivedKey => {
  const receivePath = path ?? getBitcoinFirstReceivePath(network);
  const key = deriveKey(mnemonicOrSeed, receivePath);

  return {
    ...key,
    address: encodeP2wpkhAddress(key.publicKey, network),
    path: receivePath,
  };
};

export const deriveBitcoinReceiveAddress = ({
  mnemonicOrSeed,
  network = 'mainnet',
  path,
}: {
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  path?: string;
}): string => {
  return deriveBitcoinKey({ mnemonicOrSeed, network, path }).address;
};
