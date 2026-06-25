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
