import { sha256 } from '@noble/hashes/sha2';

export type BitcoinNetworkKind = 'mainnet' | 'testnet';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const hrpToNetwork = (hrp: string): BitcoinNetworkKind | null => {
  if (hrp === 'bc') return 'mainnet';
  if (hrp === 'tb') return 'testnet';

  return null;
};

const bech32Polymod = (values: number[]): number => {
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 25;

    checksum = ((checksum & 0x1ffffff) << 5) ^ value;

    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if (((top >> index) & 1) === 1) checksum ^= BECH32_GENERATORS[index];
    }
  }

  return checksum;
};

const expandHrp = (hrp: string): number[] => [
  ...Array.from(hrp, (char) => char.charCodeAt(0) >> 5),
  0,
  ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
];

const convertBits = (values: number[], fromBits: number, toBits: number, pad: boolean): number[] | null => {
  let accumulator = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  const result: number[] = [];

  for (const value of values) {
    if (value < 0 || value >> fromBits !== 0) return null;

    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    return null;
  }

  return result;
};

export const getBitcoinAddressNetwork = (address: string): BitcoinNetworkKind | null => {
  if (address !== address.trim() || address.length < 14 || address.length > 90) return null;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null;

  const normalized = address.toLowerCase();
  const separatorIndex = normalized.lastIndexOf('1');

  if (separatorIndex < 1 || separatorIndex + 7 > normalized.length) return null;

  const hrp = normalized.slice(0, separatorIndex);
  const network = hrpToNetwork(hrp);

  if (!network) return null;

  const data = Array.from(normalized.slice(separatorIndex + 1), (char) => BECH32_CHARSET.indexOf(char));

  if (data.some((value) => value === -1)) return null;
  if (bech32Polymod([...expandHrp(hrp), ...data]) !== 1) return null;

  const version = data[0];
  const program = convertBits(data.slice(1, -6), 5, 8, false);

  if (version !== 0 || !program || program.length !== 20) return null;

  return network;
};

export const isBitcoinAddress = (address: string, expectedNetwork?: BitcoinNetworkKind): boolean => {
  const network = getBitcoinAddressNetwork(address);

  if (!network) return false;

  return expectedNetwork ? network === expectedNetwork : true;
};

/**
 * Recipient address types the wallet can pay. The wallet's own receive and
 * change addresses are always native SegWit P2WPKH (`isBitcoinAddress`); a
 * recipient may also be a legacy P2PKH (`1…`/`m…`/`n…`), P2SH (`3…`/`2…`),
 * P2WSH (`bc1q…`, 32-byte program) or Taproot P2TR (`bc1p…`) address.
 * Witness versions 2-16 are reserved for future soft forks and are rejected,
 * because outputs to them are spendable by anyone today.
 */
export type BitcoinRecipientType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';

export type BitcoinRecipient = {
  address: string;
  network: BitcoinNetworkKind;
  scriptPubKey: Uint8Array;
  type: BitcoinRecipientType;
};

export const BITCOIN_RECIPIENT_TYPES: readonly BitcoinRecipientType[] = Object.freeze([
  'p2pkh',
  'p2sh',
  'p2wpkh',
  'p2wsh',
  'p2tr',
]);

// Bitcoin Core's dust thresholds at the default 3 sat/vB dust relay fee.
const BITCOIN_DUST_THRESHOLD_SAT: Readonly<Record<BitcoinRecipientType, number>> = Object.freeze({
  p2pkh: 546,
  p2sh: 540,
  p2wpkh: 294,
  p2wsh: 330,
  p2tr: 330,
});

const BASE58_VERSIONS: Readonly<Record<number, { network: BitcoinNetworkKind; type: 'p2pkh' | 'p2sh' }>> =
  Object.freeze({
    0x00: { network: 'mainnet', type: 'p2pkh' },
    0x05: { network: 'mainnet', type: 'p2sh' },
    0x6f: { network: 'testnet', type: 'p2pkh' },
    0xc4: { network: 'testnet', type: 'p2sh' },
  });

const BECH32M_CONST = 0x2bc830a3;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const concat = (...chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

const decodeBase58 = (value: string): Uint8Array | null => {
  let number = 0n;

  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);

    if (digit === -1) return null;
    number = number * 58n + BigInt(digit);
  }

  const bytes: number[] = [];

  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }

  for (const char of value) {
    if (char !== '1') break;
    bytes.unshift(0);
  }

  return Uint8Array.from(bytes);
};

const decodeBase58Recipient = (address: string): BitcoinRecipient | null => {
  if (address.length < 26 || address.length > 35) return null;

  const decoded = decodeBase58(address);

  if (!decoded || decoded.length !== 25) return null;

  const payload = decoded.slice(0, 21);
  const checksum = sha256(sha256(payload)).slice(0, 4);

  if (checksum.some((byte, index) => byte !== decoded[21 + index])) return null;

  const version = BASE58_VERSIONS[payload[0]];

  if (!version) return null;

  const hash = payload.slice(1);
  const scriptPubKey =
    version.type === 'p2pkh'
      ? concat(Uint8Array.of(0x76, 0xa9, 0x14), hash, Uint8Array.of(0x88, 0xac))
      : concat(Uint8Array.of(0xa9, 0x14), hash, Uint8Array.of(0x87));

  return { address, network: version.network, scriptPubKey, type: version.type };
};

const decodeSegwitRecipient = (address: string): BitcoinRecipient | null => {
  if (address !== address.trim() || address.length < 14 || address.length > 90) return null;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null;

  const normalized = address.toLowerCase();
  const separatorIndex = normalized.lastIndexOf('1');

  if (separatorIndex < 1 || separatorIndex + 7 > normalized.length) return null;

  const hrp = normalized.slice(0, separatorIndex);
  const network = hrpToNetwork(hrp);

  if (!network) return null;

  const data = Array.from(normalized.slice(separatorIndex + 1), (char) => BECH32_CHARSET.indexOf(char));

  if (data.some((value) => value === -1)) return null;

  const checksum = bech32Polymod([...expandHrp(hrp), ...data]);
  const version = data[0];
  const program = convertBits(data.slice(1, -6), 5, 8, false);

  if (!program) return null;
  // BIP350: version 0 keeps the bech32 checksum, version 1 uses bech32m.
  if (version === 0 && checksum !== 1) return null;
  if (version === 1 && checksum !== BECH32M_CONST) return null;
  if (version > 1) return null;

  let type: BitcoinRecipientType;

  if (version === 0 && program.length === 20) type = 'p2wpkh';
  else if (version === 0 && program.length === 32) type = 'p2wsh';
  else if (version === 1 && program.length === 32) type = 'p2tr';
  else return null;

  const scriptPubKey = concat(Uint8Array.of(version === 0 ? 0x00 : 0x51, program.length), Uint8Array.from(program));

  return { address, network, scriptPubKey, type };
};

export const decodeBitcoinRecipient = (
  address: string,
  expectedNetwork?: BitcoinNetworkKind
): BitcoinRecipient | null => {
  if (typeof address !== 'string' || address !== address.trim()) return null;

  const recipient = decodeSegwitRecipient(address) ?? decodeBase58Recipient(address);

  if (!recipient) return null;

  return expectedNetwork && recipient.network !== expectedNetwork ? null : recipient;
};

export const isBitcoinRecipientAddress = (address: string, expectedNetwork?: BitcoinNetworkKind): boolean =>
  decodeBitcoinRecipient(address, expectedNetwork) !== null;

export const getBitcoinDustThresholdSat = (type: BitcoinRecipientType): number => BITCOIN_DUST_THRESHOLD_SAT[type];
