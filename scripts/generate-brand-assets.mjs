#!/usr/bin/env node
// Yatagarasu brand, approved 2026-11-10. The masters in scripts/brand/masters are byte-for-byte copies from the shared
// Fearless brand kit (workspace brand/yatagarasu, generated from design/yatagarasu-20261110); every output here
// derives from them. Regenerate with `node scripts/generate-brand-assets.mjs`; `--check` verifies without writing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const KIT = {
  manifestSha256: '70771ec29c8607b1964a966066affb15bb02a2032973227d7f7d2ae3c80c048b',
  designPackage: 'design/yatagarasu-20261110 (package r3)',
};
export const masterHashes = {
  'crest-badge-small.svg': 'cc2bce14632d0d24eedcb578e47fadc4852478a01b67fa0d81c2d99b37bad004',
  'crest-badge.svg': '7bb8f75f8df17f72b36fe783bf5f35f31f7d9e53b1025b7d8fe2ae42824e240c',
  'fearless-app-icon-small.svg': '20458821ba5c3f15b44ed6691eaf52145742a3f75e93be934ed1bb6718f71853',
  'fearless-app-icon.svg': 'e0e36a01482cdedd0ac5c8cb4698caef2237885f431e692a686d5a0117985c32',
  'fearless-crest-gold.svg': 'aa899e4fc5cd315279354d1163c85c3a9ea6ae8313a78a72335d0041d4ec8784',
  'fearless-crest-ink.svg': 'c4fe23a568a1b1b1ef80ede26cd3dfb8e22b8c0a0dc6f65de2a425955c58d08f',
  'fearless-crest-small.svg': 'e5fdf61cbe6300ff4242c603d273b316b9866d770897cbf31cdc8aeec32a5910',
  'fearless-crest.svg': '0dddb03fc97971d0c9226e6ed052565dfe52e75681b1df99f5b3c356f75bede5',
  'fearless-lockup-horizontal.svg': 'febd3cec4b40a681955dc5f77550e16b99730e0b216da643b0e161da7c314ca8',
  'fearless-lockup-stacked.svg': '459285f612e3283fa4c8aefcd46fab37ff3a67c447b1ef76d96a5cca9aa2f119',
  'fearless-wordmark-ink.svg': '48d08df86d712769a94479d1175a3c15cb13ae57a6641060787a4c8dad9e2222',
  'fearless-wordmark.svg': 'f38bc054643ffe94cb9b3bd325684e09b75e046e3bc9ef30f173fb2d461dc7ca',
};
// Marks the interface imports, shipped as exact copies of their masters.
export const SOURCE_MARKS = [
  'crest-badge.svg',
  'crest-badge-small.svg',
  'fearless-crest.svg',
  'fearless-crest-small.svg',
  'fearless-crest-ink.svg',
  'fearless-lockup-horizontal.svg',
  'fearless-lockup-stacked.svg',
  'fearless-wordmark.svg',
];
// Icon-sprite names that other code refers to; each is a copy of a mark.
export const ALIASES = {
  'src/assets/icons/fw-logo.svg': 'fearless-crest.svg',
  'src/assets/icons/logo-qr.svg': 'crest-badge.svg',
  'src/assets/icons/wallet-logo.svg': 'crest-badge.svg',
  'src/assets/icons/wallet-logo-transaction.svg': 'crest-badge.svg',
};
export const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024, 1042];
// Below 64 px the small crest replaces the detailed one (brand rule).
export const iconSource = (size) => (size < 64 ? 'fearless-app-icon-small.svg' : 'fearless-app-icon.svg');
const INK = '#120A2E';

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, png], index) => {
    const p = 6 + 16 * index;
    header[p] = header[p + 1] = size % 256;
    header.writeUInt16LE(1, p + 4);
    header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(png.length, p + 8);
    header.writeUInt32LE(offset, p + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(([, bytes]) => bytes)]);
}

function icns(pngs) {
  const types = {
    icp4: 16,
    icp5: 32,
    icp6: 64,
    ic07: 128,
    ic08: 256,
    ic09: 512,
    ic10: 1024,
    ic11: 32,
    ic12: 64,
    ic13: 256,
    ic14: 512,
  };
  const entries = Object.entries(types).map(([type, size]) => {
    const header = Buffer.alloc(8);
    header.write(type);
    header.writeUInt32BE(pngs[size].length + 8, 4);
    return Buffer.concat([header, pngs[size]]);
  });
  const header = Buffer.alloc(8);
  header.write('icns');
  header.writeUInt32BE(8 + entries.reduce((n, b) => n + b.length, 0), 4);
  return Buffer.concat([header, ...entries]);
}

export async function readMasters() {
  const masters = {};
  for (const [name, expected] of Object.entries(masterHashes)) {
    const bytes = await fs.readFile(path.join(root, 'scripts/brand/masters', name));
    assert.equal(sha256(bytes), expected, `unrecognized ${name} master`);
    masters[name] = bytes;
  }
  return masters;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const moduleIndex = args.indexOf('--sharp-module');
  const sharpModule = moduleIndex < 0 ? 'sharp' : path.resolve(args[moduleIndex + 1]);
  const allowed = new Set(['--check', '--sharp-module', ...(moduleIndex < 0 ? [] : [args[moduleIndex + 1]])]);
  assert(
    args.every((arg) => allowed.has(arg)),
    'usage: node scripts/generate-brand-assets.mjs [--check] [--sharp-module /path/to/sharp]'
  );
  const sharp = createRequire(import.meta.url)(sharpModule);
  assert.equal(sharp.versions.sharp, '0.35.5', 'use the pinned Sharp 0.35.5 rasterizer');
  const masters = await readMasters();
  const outputs = new Map();
  for (const name of SOURCE_MARKS) outputs.set(`src/assets/brand/${name}`, masters[name]);
  for (const [alias, name] of Object.entries(ALIASES)) outputs.set(alias, masters[name]);
  const pngs = {};
  for (const size of ICON_SIZES) {
    // The icon masters are 1024-unit squares; render at four times the target, then reduce, on an opaque ink field.
    pngs[size] = await sharp(masters[iconSource(size)], { density: ((72 * size) / 1024) * 4 })
      .resize(size, size)
      .flatten({ background: INK })
      .removeAlpha()
      .png()
      .toBuffer();
    outputs.set(`public/icons/logo-${size}.png`, pngs[size]);
  }
  outputs.set('public/favicon.ico', ico([16, 32].map((size) => [size, pngs[size]])));
  outputs.set('public/icons/logo.icns', icns(pngs));
  const provenanceFile = 'docs/release/brand-asset-provenance.json';
  const provenance = {
    provenance: {
      recordedAt: '2026-11-10T03:00:00.000Z',
      source: '2026-11-10 approved Yatagarasu brand: crest, wordmark and app icon masters copied verbatim from the Fearless brand kit',
      kit: KIT,
      masterDirectory: 'scripts/brand/masters',
      masterSha256: masterHashes,
      generator: 'scripts/generate-brand-assets.mjs',
      rule: 'Icons below 64 px use the small crest; all icons are opaque on ink #120A2E',
      rasterizer: sharp.versions,
      outputs: {},
    },
    sourceAssets: {},
    generatedAssets: {},
    aliases: {},
  };
  for (const [file, bytes] of outputs) {
    const hash = sha256(bytes);
    if (file.startsWith('public/')) provenance.generatedAssets[file] = hash;
    else if (file.startsWith('src/assets/brand/')) provenance.sourceAssets[file] = hash;
    else provenance.aliases[file] = { master: ALIASES[file], sha256: hash };
  }
  for (const size of ICON_SIZES)
    provenance.provenance.outputs[`logo-${size}.png`] = { sha256: sha256(pngs[size]), size, source: iconSource(size) };
  for (const [file, source] of [
    ['public/favicon.ico', 'logo-16.png and logo-32.png; PNG-backed ICO'],
    ['public/icons/logo.icns', 'size-specific PNG representations; ICNS'],
  ])
    provenance.provenance.outputs[path.basename(file)] = { sha256: sha256(outputs.get(file)), source };
  // Hand-written brand files the outputs travel with: the brand notes and the welcome hero media.
  for (const file of ['src/assets/brand/README.md', ...(await heroFiles())])
    provenance.sourceAssets[file] = sha256(await fs.readFile(path.join(root, file)));
  outputs.set(provenanceFile, Buffer.from(JSON.stringify(provenance, null, 2) + '\n'));
  for (const [file, bytes] of outputs) {
    const destination = path.join(root, file);
    if (check) assert.deepEqual(await fs.readFile(destination), bytes, `${file} differs from reproducible output`);
    else await fs.writeFile(destination, bytes);
  }
  console.log(`${check ? 'Verified' : 'Generated'} ${outputs.size} Yatagarasu brand assets and provenance files.`);
}

async function heroFiles() {
  const dir = path.join(root, 'src/assets/brand/hero');
  const names = await fs.readdir(dir).catch(() => []);
  return names.filter((name) => !name.startsWith('.')).sort().map((name) => `src/assets/brand/hero/${name}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
