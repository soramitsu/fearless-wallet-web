import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyTinySecp256k1Wasm } from './verify-tiny-secp256k1-wasm-provenance.mjs';

const installed = readFileSync(fileURLToPath(new URL('./secp256k1.wasm', import.meta.resolve('tiny-secp256k1'))));

test('accepts the installed module and rejects a one-byte change', () => {
  verifyTinySecp256k1Wasm();
  const tampered = Uint8Array.from(installed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => verifyTinySecp256k1Wasm(tampered), /tiny-secp256k1 WASM SHA-256 mismatch/);
});

test('rejects another package version', () => {
  assert.throws(() => verifyTinySecp256k1Wasm(installed, '2.2.4'), /No verified rebuild for tiny-secp256k1 2\.2\.4/);
});
