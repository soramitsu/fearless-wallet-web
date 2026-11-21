import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// npm tiny-secp256k1 2.2.5's module, rebuilt byte for byte from bitcoinjs/tiny-secp256k1 v2.2.5 (aab01552) with
// Rust 1.81.0 for Apple silicon macOS, as its publisher built it (docs/release/wasm-provenance.md).
export const REPRODUCED_TINY_SECP256K1_WASM = 'd5238297a4dc75c761f0cf0057d3f55e014ea84992d935869a46ad4f0df31ada';

// The browser loader (lib/wasm_loader.browser.js) imports this file, which the Chrome build ships as assets/.
const entry = import.meta.resolve('tiny-secp256k1');
const wasmPath = fileURLToPath(new URL('./secp256k1.wasm', entry));
const packagePath = fileURLToPath(new URL('../package.json', entry));

export function verifyTinySecp256k1Wasm(
  bytes = readFileSync(wasmPath),
  version = JSON.parse(readFileSync(packagePath, 'utf8')).version
) {
  if (version !== '2.2.5') {
    throw new Error(`No verified rebuild for tiny-secp256k1 ${version}`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== REPRODUCED_TINY_SECP256K1_WASM) {
    throw new Error(`tiny-secp256k1 WASM SHA-256 mismatch: expected ${REPRODUCED_TINY_SECP256K1_WASM}, got ${digest}`);
  }
  return digest;
}

if (import.meta.main) {
  console.log(`tiny-secp256k1 WASM matches the v2.2.5 source rebuild: ${verifyTinySecp256k1Wasm()}`);
}
