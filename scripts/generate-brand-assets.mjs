#!/usr/bin/env node
// Approved 2026-11-06: larger SORA disc, no cobras, original wings verbatim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const masterHashes = {
  'winged-sun-badge.svg': 'c46079a2baf438c13b6782c176f173aab70418a80bc2457c56ad8b797990bb8e',
  'winged-sun-badge-lines.svg': '61695664e36233812e24676fd5d6d533f009e237279a95f9ae6ce5f3c0889a07',
};
export const geometry = { cx: 256.05, cy: 257.7, originalRadius: 33.85, radius: 64, keyline: 2.2 };
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Parsing is used only to identify contours. Wing strings are never re-serialized.
function points(contour) {
  assert.match(contour, /^M[\d.]/);
  assert(!/[^MLHVZ\d.eE\s,+-]/.test(contour), 'unexpected master path command');
  const result = [];
  let x = 0,
    y = 0;
  for (const [, command, values] of contour.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const numbers = (values.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (command === 'M' || command === 'L') {
      for (let i = 0; i < numbers.length; i += 2) {
        x = numbers[i];
        y = numbers[i + 1];
        result.push([x, y]);
      }
    } else if (command === 'H') {
      for (const value of numbers) {
        x = value;
        result.push([x, y]);
      }
    } else if (command === 'V') {
      for (const value of numbers) {
        y = value;
        result.push([x, y]);
      }
    }
  }
  return result;
}

export function splitMaster(svg) {
  const match = svg.match(/<path fill-rule="evenodd" clip-rule="evenodd" d="([^"]+)" fill="white"\/>/);
  assert(match, 'master white path not found');
  const rings = match[1].split(/(?=M)/).map((raw) => {
    const pts = points(raw);
    const xs = pts.map(([x]) => x),
      ys = pts.map(([, y]) => y);
    return { raw, pts, box: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] };
  });
  const inside = ({ box: [x0, x1, y0, y1] }, [a, b, c, d]) => x0 >= a && x1 <= b && y0 >= c && y1 <= d;
  const cobraBoxes = rings
    .filter(({ box: [a, b, c, d] }) => b - a > 24 && b - a < 26 && d - c > 80)
    .map(({ box }) => box);
  assert.equal(cobraBoxes.length, 2, 'expected two original cobra outlines');
  const parts = { wings: [], disc: [], cobras: [], bridges: [] };
  for (const ring of rings) {
    const [x0, x1, y0] = ring.box;
    if (inside(ring, [222, 290.2, 223.5, 292]) && x1 - x0 > 30) parts.disc.push(ring);
    else if (cobraBoxes.some(([a, b, c, d]) => inside(ring, [a - 0.01, b + 0.01, c - 0.01, d + 0.01])))
      parts.cobras.push(ring);
    else if (inside(ring, [210, 302, 226, 290.5]) && y0 < 230) parts.bridges.push(ring);
    else parts.wings.push(ring);
  }
  assert.equal(parts.disc.length, 2, 'expected SORA disc and glyph contours');
  return { ...parts, match };
}

export function deriveBadge(master, name) {
  assert.equal(sha256(master), masterHashes[name], `unrecognized ${name} master`);
  const svg = master.toString();
  const { wings, disc, match } = splitMaster(svg);
  const { cx, cy, originalRadius, radius, keyline } = geometry;
  const scale = radius / originalRadius;
  // Centre rounding matches the approved comparison. Wings retain full precision.
  const scaled = disc
    .map(
      ({ pts }) =>
        'M' +
        pts.map(([x, y]) => `${+(cx + scale * (x - cx)).toFixed(2)} ${+(cy + scale * (y - cy)).toFixed(2)}`).join('L') +
        'Z'
    )
    .join('');
  const gradient = svg.match(/<linearGradient id="([^"]+)"/)[1];
  const r = radius + keyline;
  const keylinePath = `M${+(cx - r).toFixed(2)} ${cy}A${r} ${r} 0 1 0 ${+(cx + r).toFixed(2)} ${cy}A${r} ${r} 0 1 0 ${+(cx - r).toFixed(2)} ${cy}Z`;
  return svg.replace(
    match[0],
    `<path id="badge-wings" fill-rule="evenodd" clip-rule="evenodd" d="${wings.map(({ raw }) => raw).join('')}" fill="white"/>\n<path id="badge-disc-keyline" d="${keylinePath}" fill="url(#${gradient})"/>\n<path id="badge-disc" fill-rule="evenodd" clip-rule="evenodd" d="${scaled}" fill="white"/>`
  );
}

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
  const outputs = new Map();
  const badges = {};
  for (const name of Object.keys(masterHashes)) {
    const master = await fs.readFile(path.join(root, 'scripts/brand/masters', name));
    badges[name] = deriveBadge(master, name);
    outputs.set(`src/assets/brand/${name}`, Buffer.from(badges[name]));
  }
  for (const alias of ['wallet-logo.svg', 'wallet-logo-transaction.svg'])
    outputs.set(`src/assets/icons/${alias}`, Buffer.from(badges['winged-sun-badge.svg']));
  const pngs = {};
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024, 1042];
  const sourceForSize = (size) => `winged-sun-badge${size <= 32 ? '' : '-lines'}.svg`;
  for (const size of sizes) {
    pngs[size] = await sharp(Buffer.from(badges[sourceForSize(size)]), { density: ((72 * size) / 512) * 4 })
      .resize(size, size)
      .png()
      .toBuffer();
    outputs.set(`public/icons/logo-${size}.png`, pngs[size]);
  }
  outputs.set('public/favicon.ico', ico([16, 32].map((size) => [size, pngs[size]])));
  outputs.set('public/icons/logo.icns', icns(pngs));
  const provenanceFile = 'docs/release/brand-asset-provenance.json';
  const provenance = JSON.parse(await fs.readFile(path.join(root, provenanceFile), 'utf8'));
  provenance.provenance.recordedAt = '2026-11-06T12:10:03.135Z';
  provenance.provenance.source =
    '2026-11-06 approved larger SORA badge derived from preserved Figma masters; other artwork unchanged';
  provenance.provenance.badgeRevision = {
    geometry,
    masterDirectory: 'scripts/brand/masters',
    masterSha256: masterHashes,
    generator: 'scripts/generate-brand-assets.mjs',
    wings: 'Original contour strings preserved byte-for-byte',
    cobras: 'Removed, including shen holes and centre bridges',
  };
  provenance.provenance.rasterizer = sharp.versions;
  for (const [file, bytes] of outputs) {
    const hash = sha256(bytes);
    if (file.startsWith('public/')) provenance.generatedAssets[file] = hash;
    else if (file.startsWith('src/assets/brand/')) provenance.sourceAssets[file] = hash;
    else provenance.aliases[file].sha256 = hash;
  }
  for (const size of sizes)
    provenance.provenance.outputs[`logo-${size}.png`] = {
      sha256: sha256(pngs[size]),
      size,
      source: sourceForSize(size),
    };
  for (const [file, source] of [
    ['public/favicon.ico', 'logo-16.png and logo-32.png; PNG-backed ICO'],
    ['public/icons/logo.icns', 'size-specific PNG representations; ICNS'],
  ])
    provenance.provenance.outputs[path.basename(file)] = { sha256: sha256(outputs.get(file)), source };
  provenance.sourceAssets['src/assets/brand/README.md'] = sha256(
    await fs.readFile(path.join(root, 'src/assets/brand/README.md'))
  );
  outputs.set(provenanceFile, Buffer.from(JSON.stringify(provenance, null, 2) + '\n'));
  for (const [file, bytes] of outputs) {
    const destination = path.join(root, file);
    if (check) assert.deepEqual(await fs.readFile(destination), bytes, `${file} differs from reproducible output`);
    else await fs.writeFile(destination, bytes);
  }
  console.log(
    `${check ? 'Verified' : 'Generated'} ${outputs.size} brand assets/provenance files; wings unchanged; SORA disc radius 64.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
