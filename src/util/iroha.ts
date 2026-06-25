import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

export type IrohaNetworkKind = 'taira' | 'nexus' | 'dev' | 'custom';
export type IrohaNetworkInput = 'taira' | 'nexus' | 'dev' | number;

export type IrohaAddressErrorCode =
  | 'ERR_INVALID_LENGTH'
  | 'ERR_CHECKSUM_MISMATCH'
  | 'ERR_INVALID_HEX_ADDRESS'
  | 'ERR_MISSING_I105_SENTINEL'
  | 'ERR_I105_TOO_SHORT'
  | 'ERR_INVALID_I105_BASE'
  | 'ERR_INVALID_I105_CHAR'
  | 'ERR_INVALID_I105_DIGIT'
  | 'ERR_UNSUPPORTED_ADDRESS_FORMAT'
  | 'ERR_UNEXPECTED_NETWORK_PREFIX'
  | 'ERR_INVALID_I105_PREFIX'
  | 'ERR_INVALID_HEADER_VERSION'
  | 'ERR_INVALID_NORM_VERSION'
  | 'ERR_UNKNOWN_ADDRESS_CLASS'
  | 'ERR_UNEXPECTED_EXTENSION_FLAG'
  | 'ERR_UNKNOWN_CONTROLLER_TAG'
  | 'ERR_UNKNOWN_CURVE'
  | 'ERR_UNEXPECTED_TRAILING_BYTES';

export type IrohaAddressDetails = {
  chainDiscriminant: number;
  network: IrohaNetworkKind;
  canonicalHex: string;
  publicKeyHex: string;
  i105: string;
};

const CHAIN_DISCRIMINANT_TAIRA = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant;
const CHAIN_DISCRIMINANT_NEXUS = UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant;
const CHAIN_DISCRIMINANT_DEV = 0;
const I105_DISCRIMINANT_MAX = 0x3fff;
const I105_SENTINEL_SORA = 'sora';
const I105_SENTINEL_TEST = 'test';
const I105_SENTINEL_DEV = 'dev';
const I105_SENTINEL_FALLBACK_PREFIX = 'n';
const I105_CHECKSUM_LEN = 6;
const I105_BASE = 105;
const BECH32M_CONST = 0x2bc830a3;
const I105_HRP = 'snx';
const CONTROLLER_SINGLE_KEY_TAG = 0x00;
const CURVE_ED25519 = 0x01;
const ED25519_PUBLIC_KEY_LENGTH = 32;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const IROHA_POEM_KANA_HALFWIDTH = [
  '\uff72',
  '\uff9b',
  '\uff8a',
  '\uff86',
  '\uff8e',
  '\uff8d',
  '\uff84',
  '\uff81',
  '\uff98',
  '\uff87',
  '\uff99',
  '\uff66',
  '\uff9c',
  '\uff76',
  '\uff96',
  '\uff80',
  '\uff9a',
  '\uff7f',
  '\uff82',
  '\uff88',
  '\uff85',
  '\uff97',
  '\uff91',
  '\uff73',
  '\u30f0',
  '\uff89',
  '\uff75',
  '\uff78',
  '\uff94',
  '\uff8f',
  '\uff79',
  '\uff8c',
  '\uff7a',
  '\uff74',
  '\uff83',
  '\uff71',
  '\uff7b',
  '\uff77',
  '\uff95',
  '\uff92',
  '\uff90',
  '\uff7c',
  '\u30f1',
  '\uff8b',
  '\uff93',
  '\uff7e',
  '\uff7d',
] as const;
const I105_ALPHABET = [...BASE58_ALPHABET, ...IROHA_POEM_KANA_HALFWIDTH];
const I105_DIGIT_TABLE = new Map(I105_ALPHABET.map((symbol, index) => [symbol, index]));
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

export class IrohaAddressError extends Error {
  constructor(
    public readonly code: IrohaAddressErrorCode,
    message: string = code,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'IrohaAddressError';
  }
}

export const getIrohaCanonicalHex = (publicKeyHex: string): string => bytesToHex(publicKeyToCanonicalBytes(publicKeyHex));

export const encodeIrohaI105Address = (publicKeyHex: string, network: IrohaNetworkInput): string =>
  encodeIrohaI105CanonicalHex(getIrohaCanonicalHex(publicKeyHex), network);

export const encodeIrohaI105CanonicalHex = (canonicalHex: string, network: IrohaNetworkInput): string =>
  encodeI105Literal(resolveNetworkDiscriminant(network), normalizeHexBytes(canonicalHex, undefined));

export const parseIrohaI105Address = (address: string, expectedNetwork?: IrohaNetworkInput): IrohaAddressDetails => {
  if (!address || address !== address.trim()) throw new IrohaAddressError('ERR_UNSUPPORTED_ADDRESS_FORMAT');
  if (address.startsWith('0x') || address.startsWith('0X')) throw new IrohaAddressError('ERR_UNSUPPORTED_ADDRESS_FORMAT');

  const { chainDiscriminant, canonicalBytes } = decodeI105Literal(address);
  const expectedDiscriminant =
    expectedNetwork === undefined ? undefined : resolveNetworkDiscriminant(expectedNetwork);

  if (expectedDiscriminant !== undefined && chainDiscriminant !== expectedDiscriminant) {
    throw new IrohaAddressError('ERR_UNEXPECTED_NETWORK_PREFIX', 'ERR_UNEXPECTED_NETWORK_PREFIX', {
      expected: expectedDiscriminant,
      found: chainDiscriminant,
    });
  }

  const publicKeyHex = decodeCanonicalSingleEd25519(canonicalBytes);
  const i105 = encodeI105Literal(chainDiscriminant, canonicalBytes);

  if (i105 !== address) throw new IrohaAddressError('ERR_UNSUPPORTED_ADDRESS_FORMAT');

  return {
    chainDiscriminant,
    network: networkFromDiscriminant(chainDiscriminant),
    canonicalHex: bytesToHex(canonicalBytes),
    publicKeyHex,
    i105,
  };
};

export const getIrohaAddressNetwork = (address: string): IrohaNetworkKind | null => {
  try {
    return parseIrohaI105Address(address).network;
  } catch {
    return null;
  }
};

export const isIrohaI105Address = (address: string, expectedNetwork?: IrohaNetworkInput): boolean => {
  try {
    parseIrohaI105Address(address, expectedNetwork);

    return true;
  } catch {
    return false;
  }
};

const resolveNetworkDiscriminant = (network: IrohaNetworkInput): number => {
  if (network === 'taira') return CHAIN_DISCRIMINANT_TAIRA;
  if (network === 'nexus') return CHAIN_DISCRIMINANT_NEXUS;
  if (network === 'dev') return CHAIN_DISCRIMINANT_DEV;
  if (!Number.isInteger(network) || network < 0 || network > I105_DISCRIMINANT_MAX) {
    throw new IrohaAddressError('ERR_INVALID_I105_PREFIX');
  }

  return network;
};

const networkFromDiscriminant = (discriminant: number): IrohaNetworkKind => {
  if (discriminant === CHAIN_DISCRIMINANT_TAIRA) return 'taira';
  if (discriminant === CHAIN_DISCRIMINANT_NEXUS) return 'nexus';
  if (discriminant === CHAIN_DISCRIMINANT_DEV) return 'dev';

  return 'custom';
};

const sentinelForDiscriminant = (discriminant: number): string => {
  if (discriminant === CHAIN_DISCRIMINANT_NEXUS) return I105_SENTINEL_SORA;
  if (discriminant === CHAIN_DISCRIMINANT_TAIRA) return I105_SENTINEL_TEST;
  if (discriminant === CHAIN_DISCRIMINANT_DEV) return I105_SENTINEL_DEV;

  return `${I105_SENTINEL_FALLBACK_PREFIX}${discriminant}`;
};

const discriminantFromSentinel = (input: string): number | null => {
  if (input.startsWith(I105_SENTINEL_SORA)) return CHAIN_DISCRIMINANT_NEXUS;
  if (input.startsWith(I105_SENTINEL_TEST)) return CHAIN_DISCRIMINANT_TAIRA;
  if (input.startsWith(I105_SENTINEL_DEV)) return CHAIN_DISCRIMINANT_DEV;
  if (!input.startsWith(I105_SENTINEL_FALLBACK_PREFIX)) return null;

  const digits = Array.from(input.slice(1))
    .slice(0, 5)
    .filter((char, index, chars) => {
      if (!/^\d$/.test(char)) return false;

      return chars.slice(0, index).every((previous) => /^\d$/.test(previous));
    })
    .join('');

  if (!digits) return null;

  const discriminant = Number(digits);

  return Number.isInteger(discriminant) && discriminant <= I105_DISCRIMINANT_MAX ? discriminant : null;
};

const encodeI105Literal = (chainDiscriminant: number, canonicalBytes: Uint8Array): string => {
  const digits = encodeBaseN(canonicalBytes, I105_BASE);
  const checksum = i105ChecksumDigits(canonicalBytes);

  return `${sentinelForDiscriminant(chainDiscriminant)}${[...digits, ...checksum].map(i105DigitSymbol).join('')}`;
};

const decodeI105Literal = (input: string): { chainDiscriminant: number; canonicalBytes: Uint8Array } => {
  const chainDiscriminant = discriminantFromSentinel(input);

  if (chainDiscriminant === null) throw new IrohaAddressError('ERR_MISSING_I105_SENTINEL');

  const sentinel = sentinelForDiscriminant(chainDiscriminant);

  if (!input.startsWith(sentinel)) throw new IrohaAddressError('ERR_UNSUPPORTED_ADDRESS_FORMAT');

  return {
    chainDiscriminant,
    canonicalBytes: decodeI105Payload(input.slice(sentinel.length)),
  };
};

const decodeI105Payload = (payload: string): Uint8Array => {
  const digits = i105PayloadDigits(payload);

  if (digits.length <= I105_CHECKSUM_LEN) throw new IrohaAddressError('ERR_I105_TOO_SHORT');

  const splitAt = digits.length - I105_CHECKSUM_LEN;
  const canonicalBytes = decodeBaseN(digits.slice(0, splitAt), I105_BASE);
  const expected = i105ChecksumDigits(canonicalBytes);

  if (!arraysEqual(digits.slice(splitAt), expected)) throw new IrohaAddressError('ERR_CHECKSUM_MISMATCH');

  return canonicalBytes;
};

const i105PayloadDigits = (payload: string): number[] => {
  const digits: number[] = [];

  for (const char of Array.from(payload)) {
    const digit = I105_DIGIT_TABLE.get(char);

    if (digit === undefined) throw new IrohaAddressError('ERR_INVALID_I105_CHAR', 'ERR_INVALID_I105_CHAR', char);

    digits.push(digit);
  }

  return digits;
};

const i105DigitSymbol = (digit: number): string => {
  const symbol = I105_ALPHABET[digit];

  if (symbol === undefined) throw new IrohaAddressError('ERR_INVALID_I105_DIGIT', 'ERR_INVALID_I105_DIGIT', digit);

  return symbol;
};

const encodeBaseN = (bytes: Uint8Array, base: number): number[] => {
  if (base < 2) throw new IrohaAddressError('ERR_INVALID_I105_BASE');
  if (bytes.length === 0) return [0];

  const leadingZeros = countLeadingZeros(Array.from(bytes));
  const value = Array.from(bytes);
  const digits: number[] = [];
  let start = leadingZeros;

  while (start < value.length) {
    let remainder = 0;

    for (let index = start; index < value.length; index += 1) {
      const accumulator = (remainder << 8) | value[index];

      value[index] = Math.floor(accumulator / base);
      remainder = accumulator % base;
    }

    digits.push(remainder);

    while (start < value.length && value[start] === 0) start += 1;
  }

  digits.push(...Array(leadingZeros).fill(0));
  if (digits.length === 0) digits.push(0);
  digits.reverse();

  return digits;
};

const decodeBaseN = (digits: number[], base: number): Uint8Array => {
  if (base < 2) throw new IrohaAddressError('ERR_INVALID_I105_BASE');
  if (digits.length === 0) throw new IrohaAddressError('ERR_INVALID_LENGTH');

  const leadingZeros = countLeadingZeros(digits);
  const value = [...digits];
  const bytes: number[] = [];
  let start = leadingZeros;

  while (start < value.length) {
    let remainder = 0;

    for (let index = start; index < value.length; index += 1) {
      const digit = value[index];

      if (digit >= base) throw new IrohaAddressError('ERR_INVALID_I105_DIGIT', 'ERR_INVALID_I105_DIGIT', digit);

      const accumulator = remainder * base + digit;

      value[index] = Math.floor(accumulator / 256);
      remainder = accumulator % 256;
    }

    bytes.push(remainder);

    while (start < value.length && value[start] === 0) start += 1;
  }

  bytes.push(...Array(leadingZeros).fill(0));
  bytes.reverse();

  return new Uint8Array(bytes);
};

const countLeadingZeros = (values: number[]): number => {
  let count = 0;

  for (const value of values) {
    if (value !== 0) break;
    count += 1;
  }

  return count;
};

const i105ChecksumDigits = (canonicalBytes: Uint8Array): number[] => {
  const data = convertToBase32(canonicalBytes);
  const values = [...expandHrp(I105_HRP), ...data, ...Array(I105_CHECKSUM_LEN).fill(0)];
  const polymod = bech32Polymod(values) ^ BECH32M_CONST;

  return Array.from({ length: I105_CHECKSUM_LEN }, (_, index) => (polymod >>> (5 * (I105_CHECKSUM_LEN - 1 - index))) & 0x1f);
};

const convertToBase32 = (bytes: Uint8Array): number[] => {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];

  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result.push((accumulator >> bits) & 0x1f);
    }
  }

  if (bits > 0) result.push((accumulator << (5 - bits)) & 0x1f);

  return result;
};

const bech32Polymod = (values: number[]): number => {
  let checksum = 1;

  for (const value of values) {
    const top = checksum >>> 25;

    checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0;

    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if (((top >>> index) & 1) === 1) checksum = (checksum ^ BECH32_GENERATORS[index]) >>> 0;
    }
  }

  return checksum >>> 0;
};

const expandHrp = (hrp: string): number[] => [
  ...Array.from(hrp, (char) => char.charCodeAt(0) >> 5),
  0,
  ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
];

const decodeCanonicalSingleEd25519 = (canonicalBytes: Uint8Array): string => {
  if (canonicalBytes.length === 0) throw new IrohaAddressError('ERR_INVALID_LENGTH');

  const header = canonicalBytes[0];
  const version = header >> 5;
  const classBits = (header >> 3) & 0b11;
  const normVersion = (header >> 1) & 0b11;
  const extFlag = (header & 1) === 1;

  if (extFlag) throw new IrohaAddressError('ERR_UNEXPECTED_EXTENSION_FLAG');
  if (version !== 0) throw new IrohaAddressError('ERR_INVALID_HEADER_VERSION', 'ERR_INVALID_HEADER_VERSION', version);
  if (normVersion !== 1) throw new IrohaAddressError('ERR_INVALID_NORM_VERSION', 'ERR_INVALID_NORM_VERSION', normVersion);
  if (classBits !== 0) throw new IrohaAddressError('ERR_UNKNOWN_ADDRESS_CLASS', 'ERR_UNKNOWN_ADDRESS_CLASS', classBits);

  const tag = canonicalBytes[1];
  const curve = canonicalBytes[2];
  const length = canonicalBytes[3];

  if (tag === undefined || curve === undefined || length === undefined) throw new IrohaAddressError('ERR_INVALID_LENGTH');
  if (tag !== CONTROLLER_SINGLE_KEY_TAG) throw new IrohaAddressError('ERR_UNKNOWN_CONTROLLER_TAG', 'ERR_UNKNOWN_CONTROLLER_TAG', tag);
  if (curve !== CURVE_ED25519) throw new IrohaAddressError('ERR_UNKNOWN_CURVE', 'ERR_UNKNOWN_CURVE', curve);
  if (length !== ED25519_PUBLIC_KEY_LENGTH) throw new IrohaAddressError('ERR_INVALID_LENGTH');

  const publicKey = canonicalBytes.slice(4, 4 + length);

  if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) throw new IrohaAddressError('ERR_INVALID_LENGTH');
  if (canonicalBytes.length !== 4 + length) throw new IrohaAddressError('ERR_UNEXPECTED_TRAILING_BYTES');

  return bytesToHex(publicKey).slice(2);
};

const publicKeyToCanonicalBytes = (publicKeyHex: string): Uint8Array => {
  const publicKey = normalizeHexBytes(publicKeyHex, ED25519_PUBLIC_KEY_LENGTH);
  const canonical = new Uint8Array(4 + publicKey.length);

  canonical[0] = 0x02;
  canonical[1] = CONTROLLER_SINGLE_KEY_TAG;
  canonical[2] = CURVE_ED25519;
  canonical[3] = publicKey.length;
  canonical.set(publicKey, 4);

  return canonical;
};

const normalizeHexBytes = (value: string, expectedBytes?: number): Uint8Array => {
  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;

  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new IrohaAddressError('ERR_INVALID_HEX_ADDRESS');
  }
  if (expectedBytes !== undefined && hex.length !== expectedBytes * 2) {
    throw new IrohaAddressError('ERR_INVALID_LENGTH');
  }

  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
};

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

const arraysEqual = (left: number[] | Uint8Array, right: number[] | Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
