import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import { describe, expect, it } from 'vitest';
import { checkContrast, readTokens, resolver } from '../helpers/fw-contrast.mjs';

const read = (file: string) => readFileSync(resolve(__dirname, '../..', file), 'utf8');
const source = read('design/fw.tokens.json');
const pairSource = read('design/fw.contrast-pairs.json');
const tokens = JSON.parse(source);
const pairs = JSON.parse(pairSource);
const css = compileString(read('src/styles/fw-tokens.scss')).css;
const declarations = (body: string) =>
  Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const standard = declarations(/:root\s*{([^}]+)}/s.exec(css)![1]);
const high = declarations(/\[data-fw-contrast="?high"?\]\s*{([^}]+)}/s.exec(css)![1]);
const native = { ...tokens, actualCss: { standard, high } };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('complete shared contrast contract on compiled CSS tokens', () => {
  it('pins the complete pair source and verifies every compiled semantic colour and primary gradient', () => {
    expect(sha(pairSource)).toBe('c1cda5d513e1095459004426104ef8d2e80f4bb3dc96d6b2012904ccfd180737');
    expect(read('src/styles/fw-tokens.scss')).toContain(`sha256 ${sha(source)}`);
    const expected = readTokens(source);
    const actual = readTokens(JSON.stringify(native));
    expect(actual).toEqual(expected);
    expect(pairs.pairs).toHaveLength(33);
  });

  it('checks all 172 pairs in both palettes and alpha encodings, including white-backed chrome', () => {
    const report = checkContrast(native, pairs);
    expect(report.pairResults).toHaveLength(688);
    expect(report.pairResults.reduce((sum, row) => sum + row.variants, 0)).toBe(2996);
    expect(resolver(native, pairs)('chromeSurface')).toHaveLength(7);
    expect(report.cvd.map((row) => Math.round(row.deltaE76))).toEqual([95, 54, 67, 97]);
  });

  it('rejects a real compiled control-opacity regression and indistinguishable price colours', () => {
    const weak = structuredClone(native);
    weak.actualCss.standard['--fw-stroke-control'] = 'rgb(255 255 255 / .28)';
    expect(() => checkContrast(weak, pairs)).toThrow(/control-boundary/);
    const same = structuredClone(native);
    same.actualCss.standard['--fw-down'] = same.actualCss.standard['--fw-up'];
    expect(() => checkContrast(same, pairs)).toThrow(/CVD .* below floor/);
    const dim = structuredClone(native);
    dim.actualCss.high['--fw-text-2'] = '#333333';
    expect(() => checkContrast(dim, pairs)).toThrow(/requires 4.5/);
  });

  it('retains source/byte alpha differences and exact gradient midpoint colours', () => {
    expect(resolver(native, pairs, false, 'source')('peakAllDither')[0].rgb).toEqual([71, 49, 107]);
    expect(resolver(native, pairs, false, 'byte')('peakAllDither')[0].rgb).toEqual([71, 50, 107]);
    const opposing = structuredClone(native);
    opposing.actualCss.standard['--fw-fill'] = 'linear-gradient(180deg,#000100 0%,#010000 100%)';
    expect(resolver(opposing, pairs)('primaryFill').map((p) => p.rgb)).toContainEqual([1, 1, 0]);
  });

  it('rejects numerically passing but forbidden text placement and missing CSS token inputs', () => {
    const invalid = structuredClone(pairs);
    invalid.pairs.find((p) => p.id === 'text-aurora')!.foregrounds.push('textPromo');
    expect(() => checkContrast(native, invalid)).toThrow(/Forbidden text on raw aurora/);
    const missing = structuredClone(native);
    delete missing.actualCss.standard['--fw-text-2'];
    expect(() => checkContrast(missing, pairs)).toThrow(/Unsupported compiled colour/);
  });
});
