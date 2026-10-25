import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import { compileStyle, parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const repository = (path: string) => resolve(__dirname, '../..', path);
const read = (path: string) => readFileSync(repository(path), 'utf8');
// Compiled the way Vite compiles it: the shared variables and mixins are prepended to every SCSS file.
const compile = (path: string) =>
  compileString(
    `@use "src/styles/_layout.scss" as *; @use "src/styles/_mixins.scss" as *; @use "src/styles/common.scss" as *;\n${read(path)}`,
    { loadPaths: [repository('.')], url: new URL(`file://${repository(path)}`) }
  ).css;
const flat = (css: string) => css.replace(/\s+/g, ' ');

type Color = {
  $value: { hex: string; components: number[]; alpha?: number };
  $extensions?: { fw?: Record<string, unknown> };
};
const tokenText = read('design/fw.tokens.json');
const tokens = JSON.parse(tokenText) as { color: Record<string, Record<string, Color>> };
const entries = (group: Record<string, Color>) => Object.entries(group).filter(([key]) => !key.startsWith('$'));
const bytes = ({ $value }: Color) => $value.components.map((component) => Math.round(component * 255));

describe('Neon Glass tokens (design-system 6.3, 14.0)', () => {
  const generated = read('src/styles/fw-tokens.scss');
  const css = flat(compile('src/styles/fw-tokens.scss'));

  it('is the generated file for exactly this copy of the token source', () => {
    const sha = createHash('sha256').update(tokenText).digest('hex');

    expect(generated.split('\n').slice(0, 3)).toEqual([
      '// fw-tokens.scss: GENERATED from config/design/fw.tokens.json; do not edit.',
      `// sha256 ${sha}`,
      '// Regenerate: node scripts/design/gen-fw-tokens.mjs --web <checkout>',
    ]);
  });

  it('declares every semantic colour on :root with its token value', () => {
    const declarations = entries(tokens.color.semantic).filter(([, token]) => token.$extensions?.fw?.css);

    expect(declarations.length).toBeGreaterThan(30);
    for (const [key, token] of declarations) {
      const name = token.$extensions?.fw?.css as string;
      const value = new RegExp(`${name}: ([^;]+);`).exec(css)?.[1];
      const alpha = token.$value.alpha ?? 1;

      if (alpha === 1) expect(value, key).toBe(token.$value.hex);
      else {
        expect(value, key).toMatch(new RegExp(`^rgb\\(${bytes(token).join(' ')} ?/ ?0?\\.\\d+\\)$`));
        expect(Number(value?.split('/')[1].replace(')', '')), key).toBeCloseTo(alpha, 3);
      }
    }
    expect(css).toContain(':root { color-scheme: dark;');
  });

  it('switches text and edge colours under data-fw-contrast="high"', () => {
    const block = /\[data-fw-contrast=["']?high["']?\] \{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(block).toContain(`--fw-text-2: ${tokens.color.highContrast.textSecondary.$value.hex}`);
    expect(block).toContain(`--fw-text-3: ${tokens.color.highContrast.textTertiary.$value.hex}`);
    expect(block).toContain('--fw-stroke-control: rgb(255 255 255/.55)');
  });
});

describe('effects tiers (_fw-effects.scss)', () => {
  const css = flat(compile('src/styles/_fw-effects.scss'));

  it('paints the page background statically, so nothing tier-dependent shows before mount', () => {
    expect(css).toMatch(/(^| )html \{ background: var\(--fw-bg-base\); \}/);
    // A body background would paint over the backdrop's negative z-index.
    expect(css).not.toMatch(/(^|[ ,])body[ ,{]/);
  });

  it('draws the backdrop from the three aurora tokens on a fixed, non-interactive layer', () => {
    const rule = /\.fw-backdrop \{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(rule).toContain('position: fixed');
    expect(rule).toContain('inset: 0');
    expect(rule).toContain('z-index: -1');
    expect(rule).toContain('pointer-events: none');
    for (const [name, blob] of entries(tokens.color.aurora)) {
      const { center, radius } = blob.$extensions?.fw as { center: [number, number]; radius: number };
      const gradient = `radial-gradient(circle ${Math.round(radius * 100)}vw at ${Math.round(center[0] * 100)}% ${Math.round(
        center[1] * 100
      )}%, rgba(${bytes(blob).join(', ')}, ${blob.$value.alpha}), transparent 70%)`;

      expect(rule, name).toContain(gradient);
    }
    // Sass writes the colours as rgba(); the layer ends on the opaque base colour.
    expect(rule).toMatch(/var\(--fw-bg-base\); $/);
  });

  it('flattens the backdrop for Reduced and Calm, and removes it under forced colours', () => {
    expect(css).toContain(
      '[data-fw-effects=reduced] .fw-backdrop, .fw-calm .fw-backdrop { background: var(--fw-bg-base); }'
    );
    expect(css).toMatch(/@media \(forced-colors: active\) \{ \.fw-backdrop \{ display: none; \} \}/);
  });

  it('rings keyboard focus in cyan on every interactive element', () => {
    expect(css).toContain(
      ':is(a, button, summary, select, input[type=checkbox], input[type=radio], [tabindex]):focus-visible { outline: 2px solid var(--fw-focus); outline-offset: 2px; }'
    );
  });
});

describe('the existing blur and glow layers follow the tier', () => {
  // A component's scoped style as the build emits it.
  const scoped = (path: string) =>
    flat(
      parse(read(path), { filename: path })
        .descriptor.styles.map(
          ({ content }) =>
            compileStyle({
              source: compileString(
                `@use "src/styles/_layout.scss" as *; @use "src/styles/_mixins.scss" as *; @use "src/styles/common.scss" as *;\n${content}`,
                { loadPaths: [repository('.')] }
              ).css,
              filename: path,
              id: 'data-v-fw',
              scoped: true,
            }).code
        )
        .join('\n')
    );

  it.each([
    ['src/components/Blur.vue', '.blur', '0, 0, 0'],
    ['src/components/Popup.vue', '.popup-background-blur', '0, 0, 0'],
    ['src/components/AboveForm.vue', '.background-blur', '51, 51, 51'],
    ['src/screens/wallet&asset/wallet/PortfolioGroupNetworkPicker.vue', '.picker-backdrop', '0, 0, 0'],
  ])('%s: blur at Full, none at Lite, an 80%% scrim at Reduced and on Calm screens', (path, selector, rgb) => {
    const css = scoped(path);
    const own = `${selector}[data-v-fw]`;

    expect(css).toContain('backdrop-filter: blur(5px)');
    expect(css).toContain(
      `html[data-fw-effects=lite] ${own} { -webkit-backdrop-filter: none; backdrop-filter: none; background-color: rgba(${rgb}, 0.72); }`
    );
    expect(css).toContain(
      `html[data-fw-effects=reduced] ${own}, .fw-calm ${own} { -webkit-backdrop-filter: none; backdrop-filter: none; background-color: rgba(${rgb}, 0.8); }`
    );
  });

  it('drops the asset highlight glow, an inline style, at Reduced and on Calm screens', () => {
    expect(scoped('src/components/AssetHighlightIcon.vue')).toContain(
      'html[data-fw-effects=reduced] .background-circle[data-v-fw], .fw-calm .background-circle[data-v-fw] { filter: none !important; }'
    );
  });
});

describe('the app shell', () => {
  const app = read('src/App.vue');

  it('replaces background.png and the body colour with the backdrop over bg.base', () => {
    expect(app).not.toContain('background.png');
    expect(existsSync(repository('src/assets/background.png'))).toBe(false);
    expect(app).not.toContain('rgb(54, 49, 52)');
    const body = /\nbody \{([^}]*)\}/.exec(app)?.[1] ?? '';
    expect(body).toContain('min-height: 100%');
    expect(body).not.toContain('background');
  });

  it('keeps the global reduced-motion kill switch, and stops infinite loops under it', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(app)?.[1] ?? '';

    expect(block).toContain('animation-duration: 0.01ms !important;');
    expect(block).toContain('animation-iteration-count: 1 !important;');
    expect(block).toContain('transition-duration: 0.01ms !important;');
    expect(block).toContain('scroll-behavior: auto !important;');
  });

  it('loads the tokens and tiers in both page entries, before the app chunk', () => {
    for (const entry of ['src/extension/entry/popup.ts', 'src/main.ts']) {
      const source = read(entry);

      expect(source, entry).toContain("import '@/styles/fw-tokens.scss';");
      expect(source, entry).toContain("import '@/styles/_fw-effects.scss';");
      expect(source.indexOf('installVisualEffects('), entry).toBeLessThan(source.indexOf('startWallet('));
    }
  });
});
