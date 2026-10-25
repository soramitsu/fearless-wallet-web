import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import { describe, expect, it } from 'vitest';
import { FONT_LICENSES, fontLicensesPlugin, projectLicensesPlugin } from '../../vite.config.shared.mjs';

// W-A4 fonts (design-system 7.1): Inter 3.019 vendored as WOFF2 (400/600/700) with its OFL text, the body face and
// every number under the Neon Glass palette; the akk and egy locales keep rendering in the bundled Noto faces.
const repository = (path: string) => resolve(__dirname, '../..', path);
const read = (path: string) => readFileSync(repository(path), 'utf8');
const FONTS = 'src/assets/fonts/inter';
// The node built-in: the app's polyfills alias `zlib` to a browser build without brotli.
const { brotliDecompressSync } = createRequire(import.meta.url)('node:zlib') as typeof import('node:zlib');

// An independent WOFF2 reader (W3C WOFF2 sections 4-5), with the checks browsers' decoders make.
function readWoff2(file: Buffer) {
  expect(file.toString('latin1', 0, 4)).toBe('wOF2');
  const length = file.readUInt32BE(8);
  const count = file.readUInt16BE(12);
  const compressedLength = file.readUInt32BE(20);
  expect(length).toBe(file.length);
  expect(file.readUInt16BE(14)).toBe(0);
  let offset = 48;
  const base128 = () => {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = file[offset++];
      if (index === 0 && byte === 0x80) throw new Error('UIntBase128 with a leading zero');
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('UIntBase128 longer than 5 bytes');
  };
  // WOFF2 5.1 "Known Table Tags".
  const KNOWN = [
    ...['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF '],
    ...['VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS'],
    ...['GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc'],
    ...['bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop'],
    ...['trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'],
  ];
  const directory: { tag: string; length: number; transform: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const flags = file[offset++];
    const known = flags & 0x3f;
    const tag = known === 63 ? file.toString('latin1', offset, (offset += 4)) : (KNOWN[known] ?? `#${known}`);
    directory.push({ tag, length: base128(), transform: flags >> 6 });
  }
  // Decoders round the end of the compressed block up to 4 bytes and reject a file that ends before it.
  expect(Math.ceil((offset + compressedLength) / 4) * 4).toBeLessThanOrEqual(file.length);
  const stream = brotliDecompressSync(file.subarray(offset, offset + compressedLength));
  expect(stream.length).toBe(directory.reduce((sum, table) => sum + table.length, 0));
  const tables = new Map<string, Buffer>();
  let at = 0;
  for (const { tag, length, transform } of directory) {
    // Only the null transform: version 3 for glyf and loca, 0 for every other table.
    expect(transform, tag).toBe(tag === 'glyf' || tag === 'loca' ? 3 : 0);
    tables.set(tag, stream.subarray(at, (at += length)));
  }
  return tables;
}

function cmapCodePoints(cmap: Buffer) {
  const points = new Set<number>();
  for (let index = 0; index < cmap.readUInt16BE(2); index += 1) {
    const subtable = cmap.subarray(cmap.readUInt32BE(4 + index * 8 + 4));
    if (subtable.readUInt16BE(0) !== 4) continue;
    const segments = subtable.readUInt16BE(6) / 2;
    for (let segment = 0; segment < segments; segment += 1) {
      const end = subtable.readUInt16BE(14 + segment * 2);
      const start = subtable.readUInt16BE(16 + segments * 2 + segment * 2);
      const delta = subtable.readInt16BE(16 + segments * 4 + segment * 2);
      const rangeOffsetAt = 16 + segments * 6 + segment * 2;
      const rangeOffset = subtable.readUInt16BE(rangeOffsetAt);
      for (let point = start; point <= end && point !== 0xffff; point += 1) {
        const glyph = rangeOffset
          ? subtable.readUInt16BE(rangeOffsetAt + rangeOffset + (point - start) * 2)
          : point + delta;
        if ((glyph & 0xffff) !== 0) points.add(point);
      }
    }
  }
  return points;
}

function names(name: Buffer) {
  const records = new Map<number, string>();
  const storage = name.readUInt16BE(4);
  for (let index = 0; index < name.readUInt16BE(2); index += 1) {
    const record = 6 + index * 12;
    if (name.readUInt16BE(record) !== 3) continue;
    const start = storage + name.readUInt16BE(record + 10);
    const text = name
      .subarray(start, start + name.readUInt16BE(record + 8))
      .swap16()
      .toString('utf16le');
    records.set(name.readUInt16BE(record + 6), text);
  }
  return records;
}

const parseRanges = (list: string) =>
  new Set(
    list.split(',').flatMap((range) => {
      const [low, high = low] = range
        .trim()
        .replace('U+', '')
        .split('-')
        .map((point) => parseInt(point, 16));
      return Array.from({ length: high - low + 1 }, (_, index) => low + index);
    })
  );

const stylesheet = read('src/styles/fw-fonts.scss');
const faces = [...stylesheet.matchAll(/@font-face \{([^}]*)\}/g)].map(([, body]) => ({
  family: /font-family: '([^']+)'/.exec(body)![1],
  weight: Number(/font-weight: (\d+)/.exec(body)![1]),
  file: /url\('@\/assets\/fonts\/inter\/([^']+)'\) format\('woff2'\)/.exec(body)![1],
  ranges: parseRanges(/unicode-range: ([^;]+);/.exec(body)![1]),
}));
const fonts = new Map(faces.map(({ file }) => [file, readWoff2(readFileSync(repository(`${FONTS}/${file}`)))]));

const localeText = (locale: string) => {
  const values: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') values.push(node);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(JSON.parse(read(`src/locales/${locale}/translation.json`)));
  return values.join('');
};
const isAncientScript = (point: number) =>
  (point >= 0x12000 && point <= 0x1254f) || (point >= 0x13000 && point <= 0x1345f);
// What the product prints besides its strings (design-system 7.1): approximations, trend triangles, the real minus,
// arrows, currency signs and the spaces amounts are grouped with.
const PRODUCT_SYMBOLS = '≈▲▼−→↔←₽₹₺₩₫€£¥₿✓·…«»—–’“”№   ';

describe('vendored Inter (src/assets/fonts/inter)', () => {
  it('is generated: 400, 600 and 700 for every subset, each file declared once', () => {
    expect(stylesheet.split('\n')[0]).toBe(
      '// fw-fonts.scss: GENERATED by scripts/design/build-inter-webfonts.mjs; do not edit.'
    );
    expect(stylesheet).toContain('// Inter 3.019 (SIL Open Font License 1.1, src/assets/fonts/inter/OFL.txt)');
    expect(new Set(faces.map(({ family }) => family))).toEqual(new Set(['Inter']));
    expect(new Set(faces.map(({ weight }) => weight))).toEqual(new Set([400, 600, 700]));
    expect(
      readdirSync(repository(FONTS))
        .filter((file) => file.endsWith('.woff2'))
        .sort()
    ).toEqual(faces.map(({ file }) => file).sort());
    for (const weight of [400, 600, 700]) expect(faces.filter((face) => face.weight === weight)).toHaveLength(6);
  });

  it('declares exactly the code points each file maps, so the browser never picks a face without the glyph', () => {
    for (const { file, ranges } of faces) {
      expect(cmapCodePoints(fonts.get(file)!.get('cmap')!), file).toEqual(ranges);
    }
  });

  it('keeps the copyright and the licence in every file, and ships the OFL text beside them', () => {
    for (const [file, tables] of fonts) {
      const records = names(tables.get('name')!);
      expect(records.get(0), file).toBe('Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)');
      expect(records.get(5), file).toMatch(/^Version 3\.019;/);
      expect(records.get(13), file).toContain('SIL Open Font License, Version 1.1');
    }
    const licence = read(`${FONTS}/OFL.txt`);
    expect(licence.split('\n')[0]).toBe('Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
  });

  it('keeps tabular figures in the files with the digits, which every amount uses', () => {
    for (const [file, tables] of fonts) {
      if (!/^inter-latin-\d+-normal/.test(file)) continue;
      expect([...cmapCodePoints(tables.get('cmap')!)].filter((point) => point >= 0x30 && point <= 0x39)).toHaveLength(
        10
      );
      expect(tables.get('GSUB')!.includes(Buffer.from('tnum')), file).toBe(true);
    }
  });
});

describe('glyph check (design-system 7.1)', () => {
  const covered = (weight: number) =>
    new Set(faces.filter((face) => face.weight === weight).flatMap(({ ranges }) => [...ranges]));

  it.each([400, 600, 700])('Inter %i covers every character the en and ru strings and the product print', (weight) => {
    const coverage = covered(weight);
    const text = new Set([
      ...localeText('en'),
      ...localeText('ru'),
      ...PRODUCT_SYMBOLS,
      ...read('src/locales/languages.ts'),
    ]);
    const missing = [...text]
      .map((character) => character.codePointAt(0)!)
      .filter((point) => point >= 0x20 && !isAncientScript(point) && !coverage.has(point));

    expect(missing.map((point) => `U+${point.toString(16).toUpperCase()}`)).toEqual([]);
  });

  it('leaves cuneiform and hieroglyphs to the bundled Noto faces, and covers what the akk and egy strings mix in', () => {
    const coverage = covered(400);
    for (const locale of ['akk', 'egy']) {
      const points = [...new Set(localeText(locale))].map((character) => character.codePointAt(0)!);
      expect(points.some(isAncientScript), locale).toBe(true);
      expect(
        points.filter((point) => point >= 0x20 && !isAncientScript(point) && !coverage.has(point)),
        locale
      ).toEqual([]);
    }
    expect(faces.some(({ ranges }) => [...ranges].some(isAncientScript))).toBe(false);
  });
});

describe('the body face', () => {
  const variables = (palette: 'v1' | 'legacy') =>
    compileString(
      `@use "src/styles/common.scss" as * with ($fw-palette: "${palette}");\n${read('src/styles/soramitsu-variables.scss')}`,
      { loadPaths: [repository('.')] }
    ).css.replace(/\s+/g, ' ');

  it('is Inter under v1, with the bundled Noto faces ahead of any system font', () => {
    const stack = /--s-font-family-default: ([^;]+);/.exec(variables('v1'))![1];

    expect(stack).toBe("'Inter', 'Noto Sans Egyptian Hieroglyphs', 'Noto Sans Cuneiform', system-ui, sans-serif");
    // The token's body family comes first, as the shared stack (fw-tokens.scss) names it.
    expect(read('src/styles/fw-tokens.scss')).toContain("--fw-font-body: 'Inter',system-ui,sans-serif;");
    expect(variables('v1')).toContain(':lang(en) :is(h1, h2) { font-family: var(--fw-font-display); }');
  });

  it('stays the shipped Sora stack under the legacy palette', () => {
    expect(variables('legacy')).toContain(
      "--s-font-family-default: 'Sora Variable', 'Noto Sans Egyptian Hieroglyphs', 'Noto Sans Cuneiform', sans-serif;"
    );
    expect(variables('legacy')).not.toContain(':lang(en)');
  });

  it('is declared in both page entries before the app mounts, and in the app styles', () => {
    for (const entry of ['src/extension/entry/popup.ts', 'src/main.ts', 'src/styles/index.ts']) {
      const source = read(entry);
      const at = (module: string) => source.search(new RegExp(`import '(@/styles/|\\./)${module}';`));

      expect(at('fw-fonts.scss'), entry).toBeGreaterThan(at('fw-tokens.scss'));
      expect(at('fw-fonts.scss'), entry).toBeLessThan(at('_fw-effects.scss'));
    }
    expect(read('src/styles/index.ts')).toContain("import '@fontsource/noto-sans-cuneiform';");
  });
});

describe('font licences in the package', () => {
  it('ships the Apache license and attribution notices even in builds without fonts', async () => {
    const emitted = new Map<string, Buffer>();
    const plugin = projectLicensesPlugin();
    await plugin.generateBundle.call({
      emitFile: ({ fileName, source }: { fileName: string; source: Buffer }) => emitted.set(fileName, source),
    });

    expect([...emitted.keys()]).toEqual(['LICENSE', 'NOTICE']);
    for (const fileName of ['LICENSE', 'NOTICE']) {
      expect(emitted.get(fileName)).toEqual(readFileSync(repository(fileName)));
    }
    expect(emitted.get('LICENSE')?.toString()).toContain('Version 2.0, January 2004');
    expect(emitted.get('NOTICE')?.toString()).toContain('Third-party');
  });

  it('names an OFL text for every bundled font family', () => {
    for (const [published, source] of Object.entries(FONT_LICENSES as Record<string, string>)) {
      expect(existsSync(repository(source)), source).toBe(true);
      expect(read(source), published).toContain('SIL Open Font License, Version 1.1');
      expect(published).toMatch(/^licenses\/fonts\/\w+-OFL\.txt$/);
    }
  });

  it('emits them into every build that bundles a font file, and only there', async () => {
    const run = async (bundle: Record<string, unknown>) => {
      const emitted: string[] = [];
      const plugin = fontLicensesPlugin();
      await plugin.generateBundle.call(
        { emitFile: ({ fileName }: { fileName: string }) => emitted.push(fileName) },
        {},
        bundle
      );
      return emitted;
    };

    expect(await run({ 'assets/inter-latin-400-normal.woff2': {}, 'popup.js': {} })).toEqual(
      Object.keys(FONT_LICENSES)
    );
    expect(await run({ 'background.js': {} })).toEqual([]);
  });
});
