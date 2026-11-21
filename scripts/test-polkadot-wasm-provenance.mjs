import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wasmBytes } from '@polkadot/wasm-crypto-wasm';
import { verifyPolkadotWasm } from './verify-polkadot-wasm-provenance.mjs';

test('accepts the installed module and rejects a one-byte change', () => {
  verifyPolkadotWasm();
  const tampered = Uint8Array.from(wasmBytes);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => verifyPolkadotWasm(tampered), /Polkadot WASM SHA-256 mismatch/);
});
