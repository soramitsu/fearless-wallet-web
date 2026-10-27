import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileString } from 'sass';
import { parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

// The extension's wallet column is at most 561px wide (App.vue) in the popup, the side panel and a full tab. A viewport
// query above that width holds in the popup but not in a panel dragged wide or a full tab, where the column is the
// same: the By network rows overflowed there (docs/chrome-side-panel.md).
const EXTENSION_WIDTH = 561;

const repository = (path: string) => resolve(__dirname, '../..', path);
const read = (path: string) => readFileSync(repository(path), 'utf8');
const flat = (css: string) => css.replace(/\s+/g, ' ');
// Compiled the way Vite compiles it (vite.config.shared.mjs additionalData).
const compile = (source: string) =>
  compileString(
    `@use "src/styles/_layout.scss" as *; @use "src/styles/_mixins.scss" as *; @use "src/styles/common.scss" as *;\n${source}`,
    { loadPaths: [repository('.')] }
  ).css;

function styleSources(): [string, string][] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(vue|scss)$/.test(entry.name)) files.push(path);
    }
  };
  walk(repository('src'));

  return files.sort().flatMap((path): [string, string][] => {
    const name = relative(repository('.'), path);
    if (path.endsWith('.scss')) return /\/(common|_layout|_mixins)\.scss$/.test(path) ? [] : [[name, read(name)]];

    return parse(readFileSync(path, 'utf8'), { filename: path })
      .descriptor.styles.filter(({ lang }) => lang === 'scss')
      .map(({ content }, index): [string, string] => [`${name}#${index}`, content]);
  });
}

/** Every style rule of compiled CSS, with the media queries around it. */
function rules(css: string): { selectors: string[]; media: string[] }[] {
  const found: { selectors: string[]; media: string[] }[] = [];
  const open: string[] = [];
  let text = '';

  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      const prelude = text.trim();
      open.push(prelude);
      if (!prelude.startsWith('@')) {
        found.push({ selectors: prelude.split(',').map((selector) => selector.trim()), media: open.filter((block) => block.startsWith('@media')) });
      }
      text = '';
    } else if (char === '}') {
      open.pop();
      text = '';
    } else if (char === ';') {
      text = '';
    } else {
      text += char;
    }
  }

  return found;
}

const wideBreakpoint = (media: string[]) =>
  media.flatMap((query) => [...query.matchAll(/max-width:\s*(\d+)px/g)].map(([, width]) => Number(width))).find((width) => width >= EXTENSION_WIDTH);

// Compiled while the file loads, as neon-glass-palette.spec.ts does: every style of src takes seconds.
const compiledSources = styleSources().map(([name, source]) => [name, rules(compile(source))] as const);

describe('breakpoints wider than the extension column', () => {
  it('also apply in the extension: use column-max-width, or scope a web-only query to .fw-web', () => {
    const missing = compiledSources.flatMap(([name, compiled]) => {
      const inExtension = new Set(compiled.filter(({ media }) => wideBreakpoint(media) === undefined).flatMap(({ selectors }) => selectors));

      return compiled.flatMap(({ selectors, media }) => {
        const width = wideBreakpoint(media);
        if (width === undefined) return [];

        return selectors
          .filter((selector) => !/^\.fw-web\b/.test(selector) && !inExtension.has(`.fw-extension ${selector}`))
          .map((selector) => `${name}: ${selector} (max-width: ${width}px)`);
      });
    });

    expect(missing).toEqual([]);
  });

  it('column-max-width adds the extension only above its column width', () => {
    const css = flat(
      compile(`
        @include column-max-width(480px) { .row { gap: 4px; } }
        @include column-max-width(600px) { .row { gap: 6px; } }
        .list { @include column-max-width(620px) { padding: 0; } }
      `)
    );

    expect(css).toContain('@media (max-width: 480px) { .row { gap: 4px; } }');
    expect(css).not.toContain('.fw-extension .row { gap: 4px; }');
    expect(css).toContain('@media (max-width: 600px) { .row { gap: 6px; } } .fw-extension .row { gap: 6px; }');
    expect(css).toContain('@media (max-width: 620px) { .list { padding: 0; } } .fw-extension .list { padding: 0; }');
  });
});
