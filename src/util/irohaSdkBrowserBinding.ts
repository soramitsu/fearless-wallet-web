import { encodeIrohaI105CanonicalHex, IrohaAddressError, parseIrohaI105Address } from '@/util/iroha';

// Browser replacement for `@iroha/iroha-js/dist/native.js`, wired in by the Vite
// `fearless-iroha-sdk-browser-binding` plugin.
//
// The SDK transaction codec is plain JavaScript except for I105 account parsing and
// rendering, which it delegates to its Rust binding; browsers do not have that binding.
// This module supplies only those two operations, backed by the wallet's I105 codec
// (checked against the cross-client address vectors). The SDK still re-renders every
// parsed literal and rejects any mismatch. All other native operations stay unavailable.

type NativeAddressParseResult = {
  canonicalBytes: Uint8Array;
  networkPrefix: number;
};

type NativeAddressRenderResult = {
  canonicalHex: string;
  i105: string;
};

function hexToBytes(hex: string): Uint8Array {
  const digits = hex.startsWith('0x') ? hex.slice(2) : hex;

  return Uint8Array.from(digits.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

// The SDK maps `CODE: message` native errors onto its own address error codes.
function toNativeError(error: unknown): Error {
  if (error instanceof IrohaAddressError) {
    return new Error(`${error.code.replace(/^ERR_/u, '')}: ${error.message}`);
  }

  return error instanceof Error ? error : new Error(String(error));
}

const binding = Object.freeze({
  accountAddressParseEncoded(encoded: string, expectedPrefix?: number): NativeAddressParseResult {
    try {
      const details = parseIrohaI105Address(encoded, expectedPrefix);

      return { canonicalBytes: hexToBytes(details.canonicalHex), networkPrefix: details.chainDiscriminant };
    } catch (error) {
      throw toNativeError(error);
    }
  },
  accountAddressRender(canonical: Uint8Array, prefix: number): NativeAddressRenderResult {
    const canonicalHex = bytesToHex(canonical);

    try {
      return { canonicalHex, i105: encodeIrohaI105CanonicalHex(canonicalHex, prefix) };
    } catch (error) {
      throw toNativeError(error);
    }
  },
});

export function getNativeBinding(): typeof binding {
  return binding;
}
