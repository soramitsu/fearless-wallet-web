import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const brand = (file: string) => readFileSync(resolve(__dirname, '../../src/assets/brand', file), 'utf8');
const LAYERS = ['wings', 'uraeus-left', 'uraeus-right', 'sun-disc'] as const;

const inner = (svg: string) =>
  svg
    .replace(/^\s*<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/>\s+</g, '><')
    .trim();
const countPaths = (svg: string) => (svg.match(/<path\b/g) ?? []).length;

describe('portfolio sun layers', () => {
  const master = brand('winged-sun-colour.svg');
  const layers = LAYERS.map((name) => brand(`portfolio-sun/${name}.svg`));

  it('stack to the approved master exactly, so the mark is never edited', () => {
    expect(layers.map(inner).join('')).toBe(inner(master));
  });

  it('split the master by path index: wings, left cobra, right cobra, disc', () => {
    expect(layers.map(countPaths)).toEqual([9, 21, 21, 4]);
    expect(countPaths(master)).toBe(55);
  });

  it('share the master viewBox, so they register without any offset', () => {
    const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)?.[1];

    expect(viewBox(master)).toBe('0 0 1002 206');
    layers.forEach((layer) => expect(viewBox(layer)).toBe('0 0 1002 206'));
  });

  it('carry no script, event handler or external reference', () => {
    layers.forEach((layer) => {
      expect(layer).not.toMatch(/<script|\son[a-z]+=|href=|<image|<foreignObject|url\((?!#)/i);
    });
  });
});
