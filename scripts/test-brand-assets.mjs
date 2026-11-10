import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { ALIASES, ICON_SIZES, KIT, SOURCE_MARKS, iconSource, masterHashes, readMasters, sha256 } from './generate-brand-assets.mjs';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFile(new URL(file, root));

test('every master is the pinned kit file', async () => {
  const masters = await readMasters();
  assert.deepEqual(Object.keys(masters).sort(), Object.keys(masterHashes).sort());
  for (const [name, bytes] of Object.entries(masters)) assert.equal(sha256(bytes), masterHashes[name], name);
});

test('shipped marks and icon-sprite aliases are exact copies of their masters', async () => {
  for (const name of SOURCE_MARKS)
    assert.deepEqual(await read(`src/assets/brand/${name}`), await read(`scripts/brand/masters/${name}`), name);
  for (const [alias, name] of Object.entries(ALIASES))
    assert.deepEqual(await read(alias), await read(`scripts/brand/masters/${name}`), alias);
});

test('the retired winged-sun and cuneiform art is gone from the brand folders', async () => {
  const brand = await fs.readdir(new URL('src/assets/brand/', root));
  const icons = await fs.readdir(new URL('src/assets/icons/', root));
  for (const name of [...brand, ...icons]) assert(!/winged-sun|cuneiform|uraeus|portfolio-sun/.test(name), name);
});

test('all provenance hashes and aliases match the shipped files', async () => {
  const p = JSON.parse(await read('docs/release/brand-asset-provenance.json'));
  assert.equal(p.provenance.kit.manifestSha256, KIT.manifestSha256);
  assert.deepEqual(p.provenance.masterSha256, masterHashes);
  for (const [file, expected] of Object.entries({ ...p.sourceAssets, ...p.generatedAssets }))
    assert.equal(sha256(await read(file)), expected, file);
  for (const [file, { master, sha256: expected }] of Object.entries(p.aliases)) {
    assert.equal(ALIASES[file], master, file);
    assert.equal(sha256(await read(file)), expected, file);
  }
  for (const size of ICON_SIZES) assert.equal(p.provenance.outputs[`logo-${size}.png`].source, iconSource(size));
});

test('icons below 64 px use the small crest; the rest use the detailed one', () => {
  for (const size of ICON_SIZES) assert.equal(iconSource(size), size < 64 ? 'fearless-app-icon-small.svg' : 'fearless-app-icon.svg');
});

test('every PNG is opaque and has its advertised dimensions; ICO/ICNS contain the right size-specific PNGs', async () => {
  for (const size of ICON_SIZES) {
    const bytes = await read(`public/icons/logo-${size}.png`);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    // IHDR colour type 2 is RGB: no alpha channel, so stores never draw the icon on an unexpected background.
    assert.equal(bytes[25], 2, `logo-${size}.png colour type`);
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

test('the welcome hero media are recorded in provenance', async () => {
  const p = JSON.parse(await read('docs/release/brand-asset-provenance.json'));
  const hero = (await fs.readdir(new URL('src/assets/brand/hero/', root))).filter((name) => !name.startsWith('.'));
  assert.deepEqual(hero.sort(), ['popup-caw.webm', 'popup-idle.webm', 'popup-poster.webp']);
  for (const name of hero) assert.equal(p.sourceAssets[`src/assets/brand/hero/${name}`], sha256(await read(`src/assets/brand/hero/${name}`)));
});
