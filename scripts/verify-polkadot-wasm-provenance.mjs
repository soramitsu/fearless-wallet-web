import { createHash } from 'node:crypto';
import { packageInfo, wasmBytes } from '@polkadot/wasm-crypto-wasm';

const reproduced = '7edb3158a3ec97e5bd72f35476128a1c09273a109887fd445b366ad1ebc21b06';

export function verifyPolkadotWasm(bytes = wasmBytes) {
  if (packageInfo.version !== '7.5.4') {
    throw new Error(`No verified rebuild for @polkadot/wasm-crypto-wasm ${packageInfo.version}`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== reproduced) {
    throw new Error(`Polkadot WASM SHA-256 mismatch: expected ${reproduced}, got ${digest}`);
  }
  return digest;
}

if (import.meta.main) {
  console.log(`Polkadot WASM matches the v7.5.4 source rebuild: ${verifyPolkadotWasm()}`);
}
