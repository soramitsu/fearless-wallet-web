import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const HISTORICAL_SHA256 = '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8';
const TAR_BYTES = 8_035_840;
const MAX_COMPRESSED_BYTES = 4 * 1_024 * 1_024;

/** Keep the original evidence pin; allow only gzip encoding to vary by zlib. */
export function verifyCandidateRepack(historical, replay) {
  if (!Buffer.isBuffer(historical) || !Buffer.isBuffer(replay)) throw new Error('Repack inputs must be buffers');
  if (createHash('sha256').update(historical).digest('hex') !== HISTORICAL_SHA256) {
    throw new Error('Historical candidate gzip digest mismatch');
  }
  if (!replay.length || replay.length > MAX_COMPRESSED_BYTES) throw new Error('Replay gzip exceeds its bound');

  const expand = (bytes) => {
    let tar;
    try {
      tar = gunzipSync(bytes, { maxOutputLength: TAR_BYTES });
    } catch {
      throw new Error('Repack decompression failed or exceeded its bounded output');
    }
    if (tar.length !== TAR_BYTES) throw new Error('Exact replay TAR byte count mismatch');
    return tar;
  };
  const originalTar = expand(historical);
  const replayTar = expand(replay);
  // Compare the entire archive, including headers, entry order, modes and
  // padding. An extracted-files/inventory comparison would be insufficient.
  if (!replayTar.equals(originalTar)) throw new Error('Exact replay TAR bytes mismatch');

  // Both envelopes use this process's compressor. Node's bundled zlib and
  // Homebrew's system zlib can encode identical TAR bytes differently.
  const canonicalHistorical = gzipSync(originalTar, { level: 9 });
  const canonicalReplay = gzipSync(replayTar, { level: 9 });
  if (!canonicalReplay.equals(canonicalHistorical)) throw new Error('Canonical replay gzip bytes mismatch');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: verify-iroha-js-candidate-repack.mjs <historical.tgz> <replay.tgz>');
    verifyCandidateRepack(readFileSync(process.argv[2]), readFileSync(process.argv[3]));
  } catch (error) {
    console.error(`Iroha JS candidate repack verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
