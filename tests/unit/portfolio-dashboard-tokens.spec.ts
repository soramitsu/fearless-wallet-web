import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(__dirname, '../../src/styles', file), 'utf8');
const hexOf = (css: string, name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);

  if (!match) throw new Error(`--${name} is not a hex colour`);

  return match[1].toUpperCase();
};

const dashboardCss = read('_fw-dashboard.scss');
const tokensCss = read('fw-tokens.scss');

// The values the design spec validated (SPEC 3.3). A slot changes there first, with a new validator run.
const SPEC = {
  'fw-chart-1': '#FF009A',
  'fw-chart-2': '#4693F1',
  'fw-chart-3': '#A97416',
  'fw-chart-4': '#8B5CFF',
  'fw-chart-5': '#3CA694',
  'fw-chart-other': '#6F7280',
} as const;
const SLOTS = Object.keys(SPEC) as Array<keyof typeof SPEC>;

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as Rgb;
const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(linear);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (light + 0.05) / (dark + 0.05);
};
// OKLab (Ottosson), scaled by 100 as the dataviz validator does.
const oklab = (rgb: Rgb): Rgb => {
  const [r, g, b] = rgb.map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const deltaE = (a: string, b: string) => {
  const [l1, a1, b1] = oklab(toRgb(a));
  const [l2, a2, b2] = oklab(toRgb(b));

  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
};
// The glass card (#141833 at 72%) over the base colour, as the hero card paints it.
const mix = (top: Rgb, alpha: number, bottom: Rgb): Rgb => top.map((value, index) => value * alpha + bottom[index] * (1 - alpha)) as Rgb;

describe('portfolio dashboard chart slots', () => {
  it('are exactly the validated values of the design spec', () => {
    expect(Object.fromEntries(SLOTS.map((slot) => [slot, hexOf(dashboardCss, slot)]))).toEqual(SPEC);
  });

  it('are not in the generated Neon Glass tokens yet, so the two cannot disagree', () => {
    expect(tokensCss).not.toContain('--fw-chart');
  });

  it('read at 3:1 or better on the base colour and on the glass card', () => {
    const base = toRgb(hexOf(tokensCss, 'fw-bg-base'));
    const card = mix(toRgb('#141833'), 0.72, base);

    SLOTS.forEach((slot) => {
      const rgb = toRgb(SPEC[slot]);

      expect(contrast(rgb, base), `${slot} on the base`).toBeGreaterThanOrEqual(3);
      expect(contrast(rgb, card), `${slot} on the card`).toBeGreaterThanOrEqual(3);
    });
  });

  it('keep the five hues apart for normal vision (the validator floor is 15)', () => {
    const hues = SLOTS.filter((slot) => slot !== 'fw-chart-other');

    hues.slice(1).forEach((slot, index) => {
      expect(deltaE(SPEC[hues[index]], SPEC[slot]), `${hues[index]} and ${slot}`).toBeGreaterThanOrEqual(15);
    });
  });

  // Other is slate by design: a neutral that never reads as a fifth hue, and it is always named in a chip. The spec
  // validated its contrast only, so this pins how close it may sit to a hue. Slot 5 is the nearest, at about 14.9, a
  // hair under the 15 floor the hues keep among themselves; widening it is a design change on all three apps.
  it('keep Other neutral and no closer to a hue than it is today', () => {
    const [, a, b] = oklab(toRgb(SPEC['fw-chart-other']));

    expect(Math.hypot(a, b) * 100).toBeLessThan(5);
    SLOTS.filter((slot) => slot !== 'fw-chart-other').forEach((slot) => {
      expect(deltaE(SPEC[slot], SPEC['fw-chart-other']), `${slot} and Other`).toBeGreaterThanOrEqual(14.5);
    });
  });

  it('never reuse a status or price colour', () => {
    const reserved = ['fw-up', 'fw-down', 'fw-success', 'fw-warning', 'fw-danger', 'fw-info', 'fw-focus'].map((name) => hexOf(tokensCss, name));

    Object.values(SPEC).forEach((hex) => expect(reserved).not.toContain(hex));
  });
});
