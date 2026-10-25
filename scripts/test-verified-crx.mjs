#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, after } from 'node:test';
import { packageExtension } from './package-extension.mjs';
import { assembleCrx, parsePublicKey, prepareSigningPayload, verifyCrx } from './verified-crx.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-verified-crx-'));
after(() => fs.rm(temp, { recursive: true, force: true }));
const fixture = path.join(temp, 'extension');
await fs.mkdir(fixture);
await fs.writeFile(path.join(fixture, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '3.0.9', key: 'original-store-key-is-preserved' }));
await fs.writeFile(path.join(fixture, 'background.js'), 'console.log("fixture only");\n'.repeat(20));
const zipPath = path.join(temp, 'verified.zip');
await packageExtension({ sourceDir: fixture, outputPath: zipPath });
const zip = await fs.readFile(zipPath);
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pub = pair.publicKey.export({ format: 'der', type: 'spki' });
const pem = pair.publicKey.export({ format: 'pem', type: 'spki' });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const prepared = prepareSigningPayload(zip, pub);
const signature = sign('sha256', prepared.bytes, { key: pair.privateKey, padding: constants.RSA_PKCS1_PADDING });
const crx = assembleCrx(zip, pub, signature);

test('payload matches the Chromium CRX3 wire format and preserves every ZIP byte', () => {
  const keyHash = createHash('sha256').update(pub).digest();
  const signedHeader = Buffer.concat([Buffer.from([0x0a, 0x10]), keyHash.subarray(0, 16)]);
  const expected = Buffer.concat([Buffer.from('CRX3 SignedData\0'), Buffer.from([18, 0, 0, 0]), signedHeader, zip]);
  assert.deepEqual(prepared.bytes, expected);
  assert.deepEqual(prepareSigningPayload(zip, Buffer.from(pem)).bytes, expected);
  assert.equal(prepared.metadata.extensionVersion, '3.0.9');
  assert.equal(prepared.metadata.zipSha256, createHash('sha256').update(zip).digest('hex'));
  assert.equal(verify('sha256', expected, { key: pair.publicKey, padding: constants.RSA_PKCS1_PADDING }, signature), true);
});

test('assembled CRX is deterministic, correctly framed, pinned to the key and exact audited ZIP', () => {
  assert.equal(crx.subarray(0, 4).toString(), 'Cr24');
  assert.equal(crx.readUInt32LE(4), 3);
  // Independent fixed wire encoding for a 2048-bit SPKI key (294 bytes) and
  // signature (256 bytes); catches shared serializer/parser field-number bugs.
  assert.equal(pub.length, 294);
  const expectedHeader = Buffer.concat([
    Buffer.from([0x12, 0xac, 0x04, 0x0a, 0xa6, 0x02]), pub,
    Buffer.from([0x12, 0x80, 0x02]), signature,
    Buffer.from([0x82, 0xf1, 0x04, 0x12, 0x0a, 0x10]),
    createHash('sha256').update(pub).digest().subarray(0, 16),
  ]);
  assert.deepEqual(crx.subarray(12, 12 + crx.readUInt32LE(8)), expectedHeader);
  assert.deepEqual(crx.subarray(12 + crx.readUInt32LE(8)), zip);
  assert.deepEqual(assembleCrx(zip, pub, signature), crx);
  const result = verifyCrx(crx, pub, zip);
  assert.equal(result.signatureVerified, true);
  assert.equal(result.zipByteIdentical, true);
  assert.equal(result.rsaBits, 2048);
  assert.equal(result.uploadSignerCrxId.length, 32);
  assert.match(result.uploadSignerCrxId, /^[a-p]+$/u);
});

test('wrong-key, shortened, tampered, and RSA-PSS signatures cannot be assembled', () => {
  const tampered = Buffer.from(signature); tampered[40] ^= 1;
  for (const bad of [signature.subarray(1), tampered, sign('sha256', prepared.bytes, other.privateKey),
    sign('sha256', prepared.bytes, { key: pair.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })]) {
    assert.throws(() => assembleCrx(zip, pub, bad), /Invalid CRX3 RSA/u);
  }
});

test('changed ZIP cannot use a signature for the original', () => {
  const changed = Buffer.from(zip);
  // A legal timestamp change preserves content CRC but must invalidate signing.
  changed.writeUInt16LE(1, 10);
  assert.throws(() => assembleCrx(changed, pub, signature), /Invalid CRX3 RSA/u);
  assert.throws(() => verifyCrx(crx, pub, changed), /ZIP payload differs/u);
});

test('verification rejects a different expected public key', () => {
  assert.throws(() => verifyCrx(crx, other.publicKey.export({ format: 'der', type: 'spki' }), zip), /signing key does not match/u);
});

test('verification rejects tampered signature bytes even with the correct ZIP and key', () => {
  const changed = Buffer.from(crx);
  const signatureOffset = changed.indexOf(signature);
  assert.ok(signatureOffset > 12);
  changed[signatureOffset + 30] ^= 1;
  assert.throws(() => verifyCrx(changed, pub, zip), /Invalid CRX3 RSA/u);
});

test('verification rejects a tampered signed ID', () => {
  const changed = Buffer.from(crx);
  changed[12 + changed.readUInt32LE(8) - 1] ^= 1;
  assert.throws(() => verifyCrx(changed, pub, zip), /ID does not match/u);
});

test('verification rejects truncated headers and archives, wrong framing, and oversized headers', () => {
  for (const size of [0, 4, 11, 12, 30, 12 + crx.readUInt32LE(8), crx.length - 1]) {
    assert.throws(() => verifyCrx(crx.subarray(0, size), pub, zip));
  }
  for (const [offset, value] of [[0, 0], [4, 2], [8, 0xffffffff], [8, 0]]) {
    const changed = Buffer.from(crx); changed.writeUInt32LE(value, offset);
    assert.throws(() => verifyCrx(changed, pub, zip));
  }
});

function withHeader(header) {
  const size = Buffer.alloc(4); size.writeUInt32LE(header.length);
  return Buffer.concat([crx.subarray(0, 8), size, header, zip]);
}

test('verification rejects unknown, duplicate, malformed, and ambiguous protobuf fields', () => {
  const header = crx.subarray(12, 12 + crx.readUInt32LE(8));
  for (const suffix of [Buffer.from([0x12, 0]), Buffer.from([0x22, 0]), Buffer.from([0x80]), Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80])]) {
    assert.throws(() => verifyCrx(withHeader(Buffer.concat([header, suffix])), pub, zip));
  }
  // The first tag (0x12) is valid only in its canonical one-byte form.
  assert.throws(() => verifyCrx(withHeader(Buffer.concat([Buffer.from([0x92, 0]), header.subarray(1)])), pub, zip), /Noncanonical/u);
  assert.throws(() => verifyCrx(withHeader(Buffer.from([0x12, 0xff, 0x7f])), pub, zip), /Truncated/u);
});

test('verification rejects Chromium-forbidden ZIP end tokens in the unsigned header', () => {
  const header = crx.subarray(12, 12 + crx.readUInt32LE(8));
  for (const token of ['504b0506', '504b0607', '504b0606']) {
    assert.throws(() => verifyCrx(withHeader(Buffer.concat([header, Buffer.from(token, 'hex')])), pub, zip), /ZIP end-record token/u);
  }
});

test('key validation refuses weak RSA, non-RSA, private input, and trailing DER bytes', () => {
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  for (const key of [weak.publicKey, ec.publicKey]) {
    assert.throws(() => parsePublicKey(key.export({ type: 'spki', format: 'der' })), /RSA public key/u);
  }
  assert.throws(() => parsePublicKey(Buffer.from(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }))), /private keys are never accepted/u);
  assert.throws(() => parsePublicKey(Buffer.concat([pub, Buffer.from([0])])), /canonical SPKI/u);
});

test('ZIP validation rejects missing end records, unsupported data, CRC damage, and appended data', () => {
  for (const bad of [Buffer.alloc(0), Buffer.alloc(22), zip.subarray(0, zip.length - 1), Buffer.concat([zip, Buffer.from([0])])]) {
    assert.throws(() => prepareSigningPayload(bad, pub));
  }
  const changed = Buffer.from(zip);
  const firstData = 30 + changed.readUInt16LE(26);
  changed[firstData + 3] ^= 0xff;
  assert.throws(() => prepareSigningPayload(changed, pub), /ZIP entry|CRC mismatch/u);
});

test('CLI supports an external signer without private-key input and refuses overwrites', async () => {
  const script = fileURLToPath(new URL('./verified-crx.mjs', import.meta.url));
  const publicPath = path.join(temp, 'public.der');
  const prefix = path.join(temp, 'external');
  const sigPath = path.join(temp, 'external.sig');
  const crxPath = path.join(temp, 'external.crx');
  await fs.writeFile(publicPath, pub);
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  let result = invoke('prepare-signing-payload', '--zip', zipPath, '--public-key', publicPath, '--out-prefix', prefix);
  assert.equal(result.status, 0, result.stderr);
  const message = await fs.readFile(`${prefix}.payload.bin`);
  await fs.writeFile(sigPath, sign('sha256', message, { key: pair.privateKey, padding: constants.RSA_PKCS1_PADDING }));
  result = invoke('assemble', '--zip', zipPath, '--public-key', publicPath, '--signature', sigPath, '--out', crxPath);
  assert.equal(result.status, 0, result.stderr);
  result = invoke('verify', '--crx', crxPath, '--expected-public-key', publicPath, '--expected-zip', zipPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).zipByteIdentical, true);
  result = invoke('assemble', '--zip', zipPath, '--public-key', publicPath, '--signature', sigPath, '--out', crxPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/u);
  result = invoke('verify', '--crx', crxPath, '--expected-public-key', publicPath, '--expected-zip', zipPath, '--unknown', 'x');
  assert.notEqual(result.status, 0);
});
