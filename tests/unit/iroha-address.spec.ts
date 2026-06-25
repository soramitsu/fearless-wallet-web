import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  encodeIrohaI105Address,
  encodeIrohaI105CanonicalHex,
  getIrohaAddressNetwork,
  getIrohaCanonicalHex,
  IrohaAddressError,
  isIrohaI105Address,
  parseIrohaI105Address,
  type IrohaAddressErrorCode,
} from '@/util/iroha';

type IrohaNetworkVector = {
  publicKeyHex: string;
  canonicalHex: string;
  chainDiscriminant: number;
  i105: string;
};

type Vector = {
  id: string;
  expected: {
    iroha: {
      taira: IrohaNetworkVector;
      nexus: IrohaNetworkVector;
    };
  };
};

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
  vectors: Vector[];
};

const firstVector = fixture.vectors[0].expected.iroha;

const errorCodeOf = (action: () => unknown): IrohaAddressErrorCode => {
  try {
    action();
  } catch (error) {
    if (error instanceof IrohaAddressError) return error.code;
    throw error;
  }

  throw new Error('expected IrohaAddressError');
};

const tamperLastSymbol = (address: string): string => `${address.slice(0, -1)}${address.endsWith('1') ? '2' : '1'}`;

describe('Iroha I105 address codec', () => {
  it('encodes Taira and Nexus I105 addresses from the golden public keys', () => {
    for (const vector of fixture.vectors) {
      const { taira, nexus } = vector.expected.iroha;

      expect(getIrohaCanonicalHex(taira.publicKeyHex)).toBe(taira.canonicalHex);
      expect(getIrohaCanonicalHex(nexus.publicKeyHex)).toBe(nexus.canonicalHex);
      expect(encodeIrohaI105Address(taira.publicKeyHex, 'taira')).toBe(taira.i105);
      expect(encodeIrohaI105Address(nexus.publicKeyHex, 'nexus')).toBe(nexus.i105);
    }
  });

  it('parses and validates network-bound I105 addresses', () => {
    for (const vector of fixture.vectors) {
      const { taira, nexus } = vector.expected.iroha;

      expect(parseIrohaI105Address(taira.i105, 'taira')).toEqual({
        chainDiscriminant: taira.chainDiscriminant,
        network: 'taira',
        canonicalHex: taira.canonicalHex,
        publicKeyHex: taira.publicKeyHex,
        i105: taira.i105,
      });
      expect(parseIrohaI105Address(nexus.i105, 'nexus')).toEqual({
        chainDiscriminant: nexus.chainDiscriminant,
        network: 'nexus',
        canonicalHex: nexus.canonicalHex,
        publicKeyHex: nexus.publicKeyHex,
        i105: nexus.i105,
      });

      expect(getIrohaAddressNetwork(taira.i105)).toBe('taira');
      expect(getIrohaAddressNetwork(nexus.i105)).toBe('nexus');
      expect(isIrohaI105Address(taira.i105, 'taira')).toBe(true);
      expect(isIrohaI105Address(nexus.i105, 'nexus')).toBe(true);
      expect(isIrohaI105Address(taira.i105, 'nexus')).toBe(false);
      expect(isIrohaI105Address(nexus.i105, 'taira')).toBe(false);
    }
  });

  it('supports canonical custom numeric prefixes without accepting noncanonical spellings', () => {
    const custom = encodeIrohaI105Address(firstVector.taira.publicKeyHex, 42);

    expect(custom.startsWith('n42')).toBe(true);
    expect(parseIrohaI105Address(custom, 42)).toMatchObject({
      chainDiscriminant: 42,
      network: 'custom',
      canonicalHex: firstVector.taira.canonicalHex,
      publicKeyHex: firstVector.taira.publicKeyHex,
    });
    expect(errorCodeOf(() => parseIrohaI105Address(custom, 'taira'))).toBe('ERR_UNEXPECTED_NETWORK_PREFIX');
    expect(errorCodeOf(() => parseIrohaI105Address(custom.replace(/^n42/, 'n00042'), 42))).toBe(
      'ERR_UNSUPPORTED_ADDRESS_FORMAT'
    );
  });

  it('rejects wrong network prefixes, checksum tampering, invalid glyphs, and spoofed sentinels', () => {
    const { taira, nexus } = firstVector;

    expect(errorCodeOf(() => parseIrohaI105Address(taira.i105, 'nexus'))).toBe('ERR_UNEXPECTED_NETWORK_PREFIX');
    expect(errorCodeOf(() => parseIrohaI105Address(nexus.i105, 'taira'))).toBe('ERR_UNEXPECTED_NETWORK_PREFIX');
    expect(errorCodeOf(() => parseIrohaI105Address(tamperLastSymbol(taira.i105), 'taira'))).toBe(
      'ERR_CHECKSUM_MISMATCH'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(`${taira.i105.slice(0, 8)}!${taira.i105.slice(9)}`))).toBe(
      'ERR_INVALID_I105_CHAR'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(` ${taira.i105}`, 'taira'))).toBe(
      'ERR_UNSUPPORTED_ADDRESS_FORMAT'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(taira.canonicalHex, 'taira'))).toBe(
      'ERR_UNSUPPORTED_ADDRESS_FORMAT'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(nexus.i105.replace(/^sora/, '\uff53\uff4f\uff52\uff41')))).toBe(
      'ERR_MISSING_I105_SENTINEL'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(nexus.i105.replace('\uff9b', '\u30ed')))).toBe(
      'ERR_INVALID_I105_CHAR'
    );

    expect(getIrohaAddressNetwork(taira.canonicalHex)).toBe(null);
    expect(isIrohaI105Address(tamperLastSymbol(taira.i105), 'taira')).toBe(false);
  });

  it('rejects malformed public keys and discriminants before encoding', () => {
    expect(errorCodeOf(() => encodeIrohaI105Address('abcd', 'taira'))).toBe('ERR_INVALID_LENGTH');
    expect(errorCodeOf(() => encodeIrohaI105Address(`${firstVector.taira.publicKeyHex.slice(0, -1)}z`, 'taira'))).toBe(
      'ERR_INVALID_HEX_ADDRESS'
    );
    expect(errorCodeOf(() => encodeIrohaI105Address(firstVector.taira.publicKeyHex, -1))).toBe(
      'ERR_INVALID_I105_PREFIX'
    );
    expect(errorCodeOf(() => encodeIrohaI105Address(firstVector.taira.publicKeyHex, 0x4000))).toBe(
      'ERR_INVALID_I105_PREFIX'
    );
  });

  it('rejects checksum-valid payloads outside the wallet-supported single-key Ed25519 shape', () => {
    const valid = firstVector.taira.canonicalHex;

    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`0x22${valid.slice(4)}`, 'taira')))).toBe(
      'ERR_INVALID_HEADER_VERSION'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`0x00${valid.slice(4)}`, 'taira')))).toBe(
      'ERR_INVALID_NORM_VERSION'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`0x12${valid.slice(4)}`, 'taira')))).toBe(
      'ERR_UNKNOWN_ADDRESS_CLASS'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`0x03${valid.slice(4)}`, 'taira')))).toBe(
      'ERR_UNEXPECTED_EXTENSION_FLAG'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`${valid.slice(0, 4)}01${valid.slice(6)}`, 'taira')))).toBe(
      'ERR_UNKNOWN_CONTROLLER_TAG'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`${valid.slice(0, 6)}02${valid.slice(8)}`, 'taira')))).toBe(
      'ERR_UNKNOWN_CURVE'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`${valid.slice(0, 8)}1f${valid.slice(10)}`, 'taira')))).toBe(
      'ERR_INVALID_LENGTH'
    );
    expect(errorCodeOf(() => parseIrohaI105Address(encodeIrohaI105CanonicalHex(`${valid}00`, 'taira')))).toBe(
      'ERR_UNEXPECTED_TRAILING_BYTES'
    );
  });
});
