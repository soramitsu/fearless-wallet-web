#!/usr/bin/env node

// Upload-only CRX3 wrapper. Never reads or exports a private key, and never
// rebuilds the already audited ZIP. See docs/verified-crx-uploads.md.
import { constants, createHash, createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const CONTEXT = Buffer.from('CRX3 SignedData\0', 'ascii');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();
const fail = (message) => { throw new Error(message); };
const u32 = (value) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };

function varint(value) {
  const bytes = [];
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}

function field(number, bytes) {
  return Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
}

function fields(bytes, allowed) {
  let offset = 0;
  function readVarint() {
    const start = offset;
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      if (offset >= bytes.length) fail('Truncated protobuf varint');
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** (7 * index);
      if (!(byte & 128)) {
        if (value > 0xffffffff || !varint(value).equals(bytes.subarray(start, offset))) fail('Noncanonical protobuf varint');
        return value;
      }
    }
    fail('Oversized protobuf varint');
  }
  const result = new Map();
  while (offset < bytes.length) {
    const tag = readVarint();
    const number = Math.floor(tag / 8);
    if (tag % 8 !== 2 || !allowed.includes(number) || result.has(number)) fail('Unexpected or duplicate CRX3 field');
    const length = readVarint();
    if (length > bytes.length - offset) fail('Truncated protobuf field');
    result.set(number, bytes.subarray(offset, offset + length));
    offset += length;
  }
  if (result.size !== allowed.length) fail('Missing CRX3 field');
  return result;
}

export function parsePublicKey(input) {
  if (!Buffer.isBuffer(input) || input.length > 16384) fail('Invalid public key size');
  let der = input;
  if (input.subarray(0, 10).toString() === '-----BEGIN') {
    const match = /^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+)-----END PUBLIC KEY-----\s*$/u.exec(input.toString('ascii'));
    if (!match) fail('Expected a public SPKI key; private keys are never accepted');
    const encoded = match[1].replace(/\s/gu, '');
    der = Buffer.from(encoded, 'base64');
    if (der.toString('base64') !== encoded) fail('Invalid public key encoding');
  }
  let key;
  try { key = createPublicKey({ key: der, format: 'der', type: 'spki' }); } catch { fail('Invalid SPKI public key'); }
  if (!key.export({ type: 'spki', format: 'der' }).equals(der)) fail('Public key must be canonical SPKI DER');
  const bits = key.asymmetricKeyDetails?.modulusLength;
  if (key.asymmetricKeyType !== 'rsa' || bits < 2048 || bits > 8192) fail('An RSA public key of 2048 to 8192 bits is required');
  return { key, der, bits };
}

// Accept this repository's deterministic ZIP32 format only. Apart from checking
// structure/CRC and the manifest, release policy remains prepare:chrome-release's
// responsibility. Keeping the original bytes preserves its provenance digest.
function validateZip(zip) {
  if (!Buffer.isBuffer(zip) || zip.length < 22 || zip.length > MAX_ARCHIVE_BYTES) fail('Invalid ZIP size');
  const end = zip.length - 22;
  if (zip.readUInt32LE(end) !== 0x06054b50 || zip.readUInt16LE(end + 20) !== 0) fail('ZIP must have a complete, comment-free end record');
  const count = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  const centralStart = zip.readUInt32LE(end + 16);
  if (!count || count === 65535 || zip.readUInt32LE(end + 4) !== 0 || zip.readUInt16LE(end + 8) !== count || centralStart + centralSize !== end) fail('Unsupported or malformed ZIP32 directory');
  let central = centralStart;
  let local = 0;
  let totalExpanded = 0;
  let manifest;
  const names = new Set();
  for (let index = 0; index < count; index += 1) {
    if (central + 46 > end || zip.readUInt32LE(central) !== 0x02014b50) fail('Truncated ZIP directory entry');
    const flags = zip.readUInt16LE(central + 8);
    const method = zip.readUInt16LE(central + 10);
    const checksum = zip.readUInt32LE(central + 16);
    const compressed = zip.readUInt32LE(central + 20);
    const expanded = zip.readUInt32LE(central + 24);
    const nameLength = zip.readUInt16LE(central + 28);
    const localOffset = zip.readUInt32LE(central + 42);
    totalExpanded += expanded;
    if (flags !== 0x0800 || ![0, 8].includes(method) || !nameLength || totalExpanded > MAX_ARCHIVE_BYTES ||
        zip.readUInt16LE(central + 30) || zip.readUInt16LE(central + 32) || zip.readUInt16LE(central + 34) ||
        central + 46 + nameLength > end || localOffset !== local || local + 30 + nameLength + compressed > centralStart) fail('Unsupported or malformed ZIP entry');
    const nameBytes = zip.subarray(central + 46, central + 46 + nameLength);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    if (names.has(name) || name.includes('\\') || name.includes('\0') || name.split('/').some((part) => !part || part === '.' || part === '..')) fail('Unsafe or duplicate ZIP path');
    names.add(name);
    if (zip.readUInt32LE(local) !== 0x04034b50 || zip.readUInt16LE(local + 6) !== flags ||
        zip.readUInt16LE(local + 8) !== method || zip.readUInt32LE(local + 14) !== checksum ||
        zip.readUInt32LE(local + 18) !== compressed || zip.readUInt32LE(local + 22) !== expanded ||
        zip.readUInt16LE(local + 26) !== nameLength || zip.readUInt16LE(local + 28) !== 0 ||
        !zip.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)) fail('ZIP local header disagrees with directory');
    const body = zip.subarray(local + 30 + nameLength, local + 30 + nameLength + compressed);
    let contents;
    try { contents = method === 0 ? body : inflateRawSync(body, { maxOutputLength: Math.max(1, expanded) }); } catch { fail('Invalid compressed ZIP entry'); }
    if (contents.length !== expanded || crc32(contents) !== checksum) fail('ZIP content length or CRC mismatch');
    if (name === 'manifest.json') {
      try { manifest = JSON.parse(contents.toString('utf8')); } catch { fail('Invalid manifest.json'); }
    }
    local += 30 + nameLength + compressed;
    central += 46 + nameLength;
  }
  if (central !== end || local !== centralStart || !manifest || typeof manifest.version !== 'string') fail('Incomplete extension ZIP');
  return manifest;
}

function signedData(der) {
  return field(1, sha256(der).subarray(0, 16));
}

function payload(zip, data) {
  return Buffer.concat([CONTEXT, u32(data.length), data, zip]);
}

function metadata(zip, publicKey, manifest) {
  const hash = sha256(publicKey.der);
  return {
    format: 'CRX3', signatureAlgorithm: 'RSA_PKCS1_SHA256',
    zipSha256: sha256(zip).toString('hex'), zipBytes: zip.length,
    extensionVersion: manifest.version, publicKeySha256: hash.toString('hex'),
    uploadSignerCrxId: [...hash.subarray(0, 16).toString('hex')].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join(''),
    rsaBits: publicKey.bits,
  };
}

export function prepareSigningPayload(zip, publicKeyBytes) {
  const publicKey = parsePublicKey(publicKeyBytes);
  const manifest = validateZip(zip);
  const bytes = payload(zip, signedData(publicKey.der));
  return { bytes, metadata: { ...metadata(zip, publicKey, manifest), payloadSha256: sha256(bytes).toString('hex') } };
}

function assertSignature(signature, bytes, publicKey) {
  if (!Buffer.isBuffer(signature) || signature.length !== Math.ceil(publicKey.bits / 8) ||
      !verify('sha256', bytes, { key: publicKey.key, padding: constants.RSA_PKCS1_PADDING }, signature)) fail('Invalid CRX3 RSA PKCS#1 SHA-256 signature');
}

function rejectZipTokens(header) {
  for (const token of ['504b0506', '504b0607', '504b0606']) {
    if (header.includes(Buffer.from(token, 'hex'))) fail('CRX3 header contains a ZIP end-record token rejected by Chromium');
  }
}

export function assembleCrx(zip, publicKeyBytes, signature) {
  const publicKey = parsePublicKey(publicKeyBytes);
  validateZip(zip);
  const data = signedData(publicKey.der);
  assertSignature(signature, payload(zip, data), publicKey);
  const proof = Buffer.concat([field(1, publicKey.der), field(2, signature)]);
  const header = Buffer.concat([field(2, proof), field(10000, data)]);
  rejectZipTokens(header);
  return Buffer.concat([Buffer.from('Cr24'), u32(3), u32(header.length), header, zip]);
}

export function verifyCrx(crx, expectedPublicKeyBytes, expectedZip) {
  const expected = parsePublicKey(expectedPublicKeyBytes);
  if (!Buffer.isBuffer(crx) || crx.length < 12 || !crx.subarray(0, 4).equals(Buffer.from('Cr24')) || crx.readUInt32LE(4) !== 3) fail('Invalid CRX3 magic or version');
  const headerSize = crx.readUInt32LE(8);
  if (!headerSize || headerSize > MAX_HEADER_BYTES || 12 + headerSize >= crx.length) fail('Truncated or oversized CRX3 header');
  const headerBytes = crx.subarray(12, 12 + headerSize);
  rejectZipTokens(headerBytes);
  const header = fields(headerBytes, [2, 10000]);
  const proof = fields(header.get(2), [1, 2]);
  const data = header.get(10000);
  const id = fields(data, [1]).get(1);
  if (!proof.get(1).equals(expected.der)) fail('CRX3 signing key does not match expected public key');
  if (!id.equals(sha256(expected.der).subarray(0, 16))) fail('CRX3 ID does not match signing key');
  const zip = crx.subarray(12 + headerSize);
  if (!Buffer.isBuffer(expectedZip) || !zip.equals(expectedZip)) fail('CRX3 ZIP payload differs from the verified ZIP');
  const manifest = validateZip(zip);
  assertSignature(proof.get(2), payload(zip, data), expected);
  return { ...metadata(zip, expected, manifest), crxSha256: sha256(crx).toString('hex'), crxBytes: crx.length, signatureVerified: true, zipByteIdentical: true };
}

async function readBounded(filename, maximum) {
  const handle = await fs.open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum) fail('Input must be a regular file within the size limit');
    const bytes = await handle.readFile();
    if (bytes.length > maximum) fail('Input exceeds size limit');
    return bytes;
  } finally { await handle.close(); }
}

async function main(argv) {
  const [mode, ...args] = argv;
  const required = {
    'prepare-signing-payload': ['zip', 'public-key', 'out-prefix'],
    assemble: ['zip', 'public-key', 'signature', 'out'],
    verify: ['crx', 'expected-public-key', 'expected-zip'],
  }[mode];
  if (!required) fail('Usage: verified-crx.mjs prepare-signing-payload|assemble|verify (see docs/verified-crx-uploads.md)');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index].slice(2);
    if (!args[index].startsWith('--') || !required.includes(option) || options[option] || !args[index + 1] || args[index + 1].startsWith('--')) fail('Unknown, duplicate, or missing CLI option');
    options[option] = args[index + 1];
  }
  if (required.some((option) => !options[option])) fail(`Required options: ${required.map((option) => `--${option}`).join(' ')}`);
  const zip = await readBounded(options.zip ?? options['expected-zip'], MAX_ARCHIVE_BYTES);
  const key = await readBounded(options['public-key'] ?? options['expected-public-key'], 16384);
  if (mode === 'prepare-signing-payload') {
    const result = prepareSigningPayload(zip, key);
    const output = { ...result.metadata, payloadFile: `${options['out-prefix']}.payload.bin` };
    await fs.writeFile(output.payloadFile, result.bytes, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(`${options['out-prefix']}.metadata.json`, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(output, null, 2));
  } else if (mode === 'assemble') {
    const signature = await readBounded(options.signature, 1024);
    const crx = assembleCrx(zip, key, signature);
    const result = verifyCrx(crx, key, zip);
    await fs.writeFile(options.out, crx, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ...result, crxFile: options.out }, null, 2));
  } else {
    const crx = await readBounded(options.crx, MAX_ARCHIVE_BYTES + MAX_HEADER_BYTES + 12);
    console.log(JSON.stringify(verifyCrx(crx, key, zip), null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(`Verified CRX: ${error.message}`); process.exitCode = 1; });
}
