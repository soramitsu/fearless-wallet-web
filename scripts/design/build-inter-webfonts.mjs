#!/usr/bin/env node
// Vendors Inter 3.019 for the Neon Glass body face (design-system 7.1, W-A4): subsets the OFL TTFs the Android app
// bundles with HarfBuzz `hb-subset`, writes them as WOFF2 and generates src/styles/fw-fonts.scss with one @font-face per
// file whose unicode-range is exactly the file's cmap. Design-time tool: the outputs are committed, so builds and CI
// need neither HarfBuzz nor network access.
//
//   node scripts/design/build-inter-webfonts.mjs --source ../fearless-Android/common/src/main/res/font
//
// The WOFF2 files use the null transform for every table (glyf/loca transform version 3), which the format allows and
// every WOFF2 decoder accepts; brotli does the compression.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FONT_DIRECTORY = 'src/assets/fonts/inter';
export const FACES_STYLESHEET = 'src/styles/fw-fonts.scss';

// The weights design-system 7.1 names; "medium" roles use 600.
export const WEIGHTS = Object.freeze({ 400: 'inter_regular.ttf', 600: 'inter_semibold.ttf', 700: 'inter_bold.ttf' });

// Google Fonts' subset ranges for the scripts the wallet prints, plus the symbols it prints that those leave out
// (→ ↔ ≈ ▲ ▼ ✓). A code point goes to the first subset that lists it.
export const SUBSETS = Object.freeze({
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,' +
    'U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,' +
    'U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
  vietnamese:
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,' +
    'U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  symbols:
    'U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+27F0-27FF',
});

export function parseRanges(list) {
  const points = new Set();

  for (const part of list.split(',')) {
    const [low, high = low] = part.trim().replace(/^U\+/u, '').split('-');
    for (let point = parseInt(low, 16); point <= parseInt(high, 16); point += 1) points.add(point);
  }

  return points;
}

export function formatRanges(points) {
  const sorted = [...points].sort((a, b) => a - b);
  const hex = (point) => point.toString(16).toUpperCase().padStart(4, '0');
  const ranges = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    while (sorted[index + 1] === sorted[index] + 1) index += 1;
    ranges.push(start === sorted[index] ? `U+${hex(start)}` : `U+${hex(start)}-${hex(sorted[index])}`);
  }

  return ranges.join(', ');
}

export function readSfnt(buffer) {
  const count = buffer.readUInt16BE(4);
  const tables = new Map();

  for (let index = 0; index < count; index += 1) {
    const entry = 12 + index * 16;
    const tag = buffer.toString('latin1', entry, entry + 4);
    const offset = buffer.readUInt32BE(entry + 8);
    tables.set(tag, buffer.subarray(offset, offset + buffer.readUInt32BE(entry + 12)));
  }

  return { flavor: buffer.readUInt32BE(0), tables };
}

// Code points of the Unicode cmap subtables (formats 4 and 12) that map to a real glyph.
export function cmapCodePoints(cmap) {
  const points = new Set();

  for (let index = 0; index < cmap.readUInt16BE(2); index += 1) {
    const record = 4 + index * 8;
    const [platform, encoding] = [cmap.readUInt16BE(record), cmap.readUInt16BE(record + 2)];
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const table = cmap.subarray(cmap.readUInt32BE(record + 4));
    const format = table.readUInt16BE(0);

    if (format === 4) {
      const segments = table.readUInt16BE(6) / 2;
      const ends = 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const rangeOffsets = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const end = table.readUInt16BE(ends + segment * 2);
        const start = table.readUInt16BE(starts + segment * 2);
        const delta = table.readInt16BE(deltas + segment * 2);
        const rangeOffset = table.readUInt16BE(rangeOffsets + segment * 2);
        for (let point = start; point <= end && point !== 0xffff; point += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (point + delta) & 0xffff;
          else {
            const at = rangeOffsets + segment * 2 + rangeOffset + (point - start) * 2;
            glyph = table.readUInt16BE(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(point);
        }
      }
    } else if (format === 12) {
      for (let group = 0; group < table.readUInt32BE(12); group += 1) {
        const at = 16 + group * 12;
        const [start, end, glyph] = [table.readUInt32BE(at), table.readUInt32BE(at + 4), table.readUInt32BE(at + 8)];
        for (let point = start; point <= end; point += 1) if (glyph + point - start !== 0) points.add(point);
      }
    }
  }

  return points;
}

// WOFF2 table tags with a one-byte index (WOFF2 5.1, "Known Table Tags").
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

function base128(value) {
  const bytes = [value & 0x7f];
  for (let rest = value >>> 7; rest > 0; rest >>>= 7) bytes.unshift(0x80 | (rest & 0x7f));
  return Buffer.from(bytes);
}

export function encodeWoff2(sfnt) {
  const { flavor, tables } = readSfnt(sfnt);
  const tags = [...tables.keys()].sort();
  const directory = [];

  for (const tag of tags) {
    const known = KNOWN_TAGS.indexOf(tag);
    // Bits 6-7 hold the transform version: 0 is the null transform, except for glyf and loca where it is 3.
    const version = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    const flags = Buffer.from([(version << 6) | (known === -1 ? 63 : known)]);
    directory.push(flags, ...(known === -1 ? [Buffer.from(tag, 'latin1')] : []), base128(tables.get(tag).length));
  }

  const stream = Buffer.concat(tags.map((tag) => tables.get(tag)));
  const compressed = zlib.brotliCompressSync(stream, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: stream.length,
    },
  });
  const tableDirectory = Buffer.concat(directory);
  const header = Buffer.alloc(48);
  const totalSfntSize = 12 + 16 * tags.length + tags.reduce((sum, tag) => sum + ((tables.get(tag).length + 3) & ~3), 0);
  // Decoders round the end of the compressed block up to 4 bytes and reject a file shorter than that.
  const padding = Buffer.alloc((4 - ((48 + tableDirectory.length + compressed.length) % 4)) % 4);

  header.write('wOF2', 0, 'latin1');
  header.writeUInt32BE(flavor, 4);
  header.writeUInt32BE(48 + tableDirectory.length + compressed.length + padding.length, 8);
  header.writeUInt16BE(tags.length, 12);
  header.writeUInt32BE(totalSfntSize, 16);
  header.writeUInt32BE(compressed.length, 20);
  header.writeUInt16BE(1, 24);

  return Buffer.concat([header, tableDirectory, compressed, padding]);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function hbSubsetVersion() {
  return execFileSync('hb-subset', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim();
}

export function fileName(subset, weight) {
  return `inter-${subset}-${weight}-normal.woff2`;
}

function build(source) {
  const fontDirectory = path.join(root, FONT_DIRECTORY);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fearless-inter-'));
  const faces = [];
  const sources = [];

  try {
    for (const [weight, file] of Object.entries(WEIGHTS)) {
      const input = path.join(source, file);
      const font = fs.readFileSync(input);
      const available = cmapCodePoints(readSfnt(font).tables.get('cmap'));
      const assigned = new Set();
      sources.push(`${file} sha256 ${sha256(font)}`);

      for (const [subset, ranges] of Object.entries(SUBSETS)) {
        const wanted = [...parseRanges(ranges)].filter((point) => available.has(point) && !assigned.has(point));
        if (wanted.length === 0) continue;
        wanted.forEach((point) => assigned.add(point));
        const output = path.join(scratch, `${subset}-${weight}.ttf`);
        execFileSync('hb-subset', [
          `--font-file=${input}`,
          `--unicodes=${wanted.map((point) => point.toString(16)).join(',')}`,
          // Keep tabular and slashed-zero figures and every other feature, and the copyright and licence names (OFL).
          '--layout-features=*',
          '--name-IDs=*',
          '--name-languages=*',
          `--output-file=${output}`,
        ]);
        const subsetFont = fs.readFileSync(output);
        const covered = cmapCodePoints(readSfnt(subsetFont).tables.get('cmap'));
        const missing = wanted.filter((point) => !covered.has(point));
        if (missing.length) throw new Error(`${file} ${subset}: hb-subset dropped ${formatRanges(missing)}`);
        const woff2 = encodeWoff2(subsetFont);
        fs.writeFileSync(path.join(fontDirectory, fileName(subset, weight)), woff2);
        faces.push({ subset, weight, file: fileName(subset, weight), ranges: formatRanges(covered) });
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const lines = [
    `// fw-fonts.scss: GENERATED by scripts/design/build-inter-webfonts.mjs; do not edit.`,
    `// Inter 3.019 (SIL Open Font License 1.1, ${FONT_DIRECTORY}/OFL.txt), from the TTFs fearless-Android bundles:`,
    ...sources.map((line) => `//   ${line}`),
    `// Subset with ${hbSubsetVersion()}; each unicode-range is exactly the cmap of its file.`,
  ];
  for (const { subset, weight, file, ranges } of faces) {
    lines.push(
      '',
      `// ${subset}`,
      '@font-face {',
      "  font-family: 'Inter';",
      '  font-style: normal;',
      `  font-weight: ${weight};`,
      '  font-display: swap;',
      `  src: url('@/assets/fonts/inter/${file}') format('woff2');`,
      `  unicode-range: ${ranges};`,
      '}'
    );
  }
  fs.writeFileSync(path.join(root, FACES_STYLESHEET), `${lines.join('\n')}\n`);

  return faces;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf('--source');
  if (sourceIndex === -1 || !process.argv[sourceIndex + 1]) {
    console.error('Usage: node scripts/design/build-inter-webfonts.mjs --source <directory with inter_*.ttf>');
    process.exit(2);
  }
  const faces = build(path.resolve(process.argv[sourceIndex + 1]));
  console.info(`Wrote ${faces.length} faces to ${FONT_DIRECTORY} and ${FACES_STYLESHEET}`);
}
