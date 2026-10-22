import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { verifyCandidateRepack } from './verify-iroha-js-candidate-repack.mjs';

const historical = readFileSync(new URL('../artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f/iroha-iroha-js-0.0.3.tgz', import.meta.url));
const tar = gunzipSync(historical);
const alternateGzip = gzipSync(tar, { level: 1 });
assert.notDeepEqual(alternateGzip, historical);
verifyCandidateRepack(historical, historical);
verifyCandidateRepack(historical, alternateGzip);

const checksum = (header) => {
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
};
const firstSize = Number.parseInt(tar.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim(), 8);
const firstEnd = 512 + Math.ceil(firstSize / 512) * 512;
const secondSize = Number.parseInt(tar.subarray(firstEnd + 124, firstEnd + 136).toString('ascii').replace(/\0.*$/u, '').trim(), 8);
const secondEnd = firstEnd + 512 + Math.ceil(secondSize / 512) * 512;
let assertions = 3;
for (const [label, mutate] of [
  ['file content', (bytes) => { bytes[512] ^= 1; return bytes; }],
  ['valid path header', (bytes) => { bytes[0] ^= 1; checksum(bytes.subarray(0, 512)); return bytes; }],
  ['valid mode header', (bytes) => { bytes[105] = bytes[105] === 0x36 ? 0x34 : 0x36; checksum(bytes.subarray(0, 512)); return bytes; }],
  ['entry order', (bytes) => Buffer.concat([bytes.subarray(firstEnd, secondEnd), bytes.subarray(0, firstEnd), bytes.subarray(secondEnd)])],
  ['archive padding', (bytes) => { bytes[bytes.length - 1] = 1; return bytes; }],
  ['truncated archive', (bytes) => bytes.subarray(0, -512)],
  ['extra padding', (bytes) => Buffer.concat([bytes, Buffer.alloc(512)])],
  ['duplicate entry', (bytes) => Buffer.concat([bytes.subarray(0, firstEnd), bytes])],
]) {
  assert.throws(() => verifyCandidateRepack(historical, gzipSync(mutate(Buffer.from(tar)))), /TAR|bounded output/, label);
  assertions += 1;
}
assert.throws(() => verifyCandidateRepack(alternateGzip, alternateGzip), /Historical candidate gzip digest mismatch/);
assert.throws(() => verifyCandidateRepack(historical, Buffer.alloc(4 * 1_024 * 1_024 + 1)), /bound/);
assert.throws(() => verifyCandidateRepack(historical, Buffer.from('not gzip')), /decompression/);
assertions += 3;
console.log(`[iroha-js-candidate-repack-test] all ${assertions} assertions passed`);
