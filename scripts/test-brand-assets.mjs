import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { deriveBadge, geometry, masterHashes, sha256, splitMaster } from './generate-brand-assets.mjs';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFile(new URL(file, root));
const pathData = (svg, id) => svg.match(new RegExp(`<path id="${id}"[^>]* d="([^"]+)"`))[1];

for (const name of Object.keys(masterHashes)) {
  test(`${name}: original wing contours survive verbatim, approved centre replaces cobras`, async () => {
    const master = await read(`scripts/brand/masters/${name}`);
    const actual = (await read(`src/assets/brand/${name}`)).toString();
    const parts = splitMaster(master.toString());
    assert.equal(parts.wings.length, name.includes('-lines') ? 110 : 2);
    assert.equal(pathData(actual, 'badge-wings'), parts.wings.map(({ raw }) => raw).join(''));
    for (const { raw } of [...parts.cobras, ...parts.bridges]) assert(!actual.includes(raw));
    assert.match(pathData(actual, 'badge-disc-keyline'), /^M189\.85 257\.7A66\.2 66\.2 /);
    assert.equal(geometry.radius / geometry.originalRadius, 64 / 33.85);
    assert.equal(actual, deriveBadge(master, name));
    const modifiedMaster = Buffer.from(master.toString().replace('210.209', '211.209'));
    // A changed original must not silently regenerate a differently shaped wing.
    if (!modifiedMaster.equals(master)) assert.throws(() => deriveBadge(modifiedMaster, name), /unrecognized/);
  });
}

test('all provenance hashes and badge aliases match the shipped files', async () => {
  const p = JSON.parse(await read('docs/release/brand-asset-provenance.json'));
  for (const [file, expected] of Object.entries({ ...p.sourceAssets, ...p.generatedAssets }))
    assert.equal(sha256(await read(file)), expected, file);
  for (const [file, { master, sha256: expected }] of Object.entries(p.aliases)) {
    const bytes = await read(file);
    assert.equal(sha256(bytes), expected, file);
    assert.deepEqual(bytes, await read(`src/assets/brand/${master}`));
  }
});

test('every PNG has its advertised dimensions and ICO/ICNS contain the right size-specific PNGs', async () => {
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024, 1042]) {
    const bytes = await read(`public/icons/logo-${size}.png`);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const ico = await read('public/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  for (let i = 0; i < 2; i++) {
    const p = 6 + i * 16,
      size = ico[p],
      length = ico.readUInt32LE(p + 8),
      offset = ico.readUInt32LE(p + 12);
    assert.deepEqual(ico.subarray(offset, offset + length), await read(`public/icons/logo-${size}.png`));
  }
  const icns = await read('public/icons/logo.icns');
  assert.equal(icns.toString('ascii', 0, 4), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  let entries = 0;
  for (let p = 8; p < icns.length; ) {
    const length = icns.readUInt32BE(p + 4);
    assert(length > 8 && p + length <= icns.length);
    const png = icns.subarray(p + 8, p + length);
    const size = png.readUInt32BE(16);
    assert.deepEqual(png, await read(`public/icons/logo-${size}.png`));
    p += length;
    entries++;
  }
  assert.equal(entries, 11);
});
