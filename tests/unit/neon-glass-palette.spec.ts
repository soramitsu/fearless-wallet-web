import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileString } from 'sass';
import { parse } from 'vue/compiler-sfc';
import { afterEach, describe, expect, it } from 'vitest';
import { commonViteConfig, makeDefine, resolveFwPalette } from '../../vite.config.shared.mjs';
import { startWallet } from '@/bootstrap/startup';

// W-A4 (design-system 3, 14.0 item 5 and the W-A4 row of 14.3): the legacy colour names of common.scss paint the
// Neon Glass tokens under VITE_FW_PALETTE=v1 (the default) and keep their shipped values under `legacy`.
type Palette = 'v1' | 'legacy';

const repository = (path: string) => resolve(__dirname, '../..', path);
const read = (path: string) => readFileSync(repository(path), 'utf8');
const flat = (css: string) => css.replace(/\s+/g, ' ');
// Compiled the way Vite compiles it (vite.config.shared.mjs additionalData).
const header = (palette: Palette) =>
  `@use "src/styles/_layout.scss" as *; @use "src/styles/_mixins.scss" as *; @use "src/styles/common.scss" as * with ($fw-palette: "${palette}");\n`;
const compile = (source: string, palette: Palette) =>
  compileString(header(palette) + source, { loadPaths: [repository('.')] }).css;

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

const builds = Object.fromEntries(
  (['v1', 'legacy'] as const).map((palette) => [
    palette,
    Object.fromEntries(styleSources().map(([name, source]) => [name, compile(source, palette)])),
  ])
) as Record<Palette, Record<string, string>>;

// WCAG 2.x, as fw-tools/fw_contrast.py and the root generator self-test compute it.
type Rgb = [number, number, number];
type Paint = { rgb: Rgb; alpha: number };
const tokenText = read('src/styles/fw-tokens.scss');
const tokenValues = Object.fromEntries(
  [...tokenText.matchAll(/^ {2}(--[\w-]+): (.+);$/gm)].map(([, name, value]) => [name, value])
);
function paint(value: string): Paint | undefined {
  const text = value.replace('!important', '').trim();
  const token = /^var\((--fw-[\w-]+)\)$/.exec(text);
  if (token) return token[1] in tokenValues ? paint(tokenValues[token[1]]) : undefined;
  if (text === 'white') return { rgb: [255, 255, 255], alpha: 1 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const alpha = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
    return { rgb: [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as Rgb, alpha };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)$/.exec(text);
  if (rgb)
    return { rgb: [rgb[1], rgb[2], rgb[3]].map(Number) as Rgb, alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  // A fill gradient is checked at its lightest (first) stop.
  const gradient = /^linear-gradient\(180deg,\s*(#\w+)/.exec(text);
  return gradient ? paint(gradient[1]) : undefined;
}
const over = (top: Paint, bottom: Rgb): Rgb =>
  top.rgb.map((channel, index) => channel * top.alpha + bottom[index] * (1 - top.alpha)) as Rgb;
const linear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const solid = (name: string) => paint(`var(${name})`)!.rgb;
// The surfaces legacy screens put text on, per design-system 3.4: the page, the opaque surfaces and the worst glass
// composite (#2B284B), which the card surface is at Full and Lite.
const GLASS_WORST: Rgb = [0x2b, 0x28, 0x4b];
const SURFACES: Record<string, Rgb> = {
  'bg.base': solid('--fw-bg-base'),
  'surface.raised': solid('--fw-raised'),
  'surface.raised2': solid('--fw-raised-2'),
  'glass (worst)': GLASS_WORST,
};
// Rule 1 of 3.4: only these may sit on the raw aurora (worst case: three peaks and dither, #47316B); rule 4: only
// primary and secondary text label a selected chip.
const AURORA_WORST: Rgb = [0x47, 0x31, 0x6b];
const ON_AURORA = ['var(--fw-text-1)', 'var(--fw-text-2)', 'var(--fw-link)', 'var(--fw-success)', 'var(--fw-warning)'];
const ON_SELECTION = ['var(--fw-text-1)', 'var(--fw-text-2)'];
const SELECTED_CHIP = over(paint('var(--fw-select-fill)')!, GLASS_WORST);

afterEach(() => {
  delete process.env.VITE_FW_PALETTE;
  document.body.innerHTML = '';
});

describe('VITE_FW_PALETTE', () => {
  it('builds Neon Glass by default and the shipped look on request, and rejects anything else', () => {
    expect(resolveFwPalette({})).toBe('v1');
    expect(resolveFwPalette({ VITE_FW_PALETTE: 'v1' })).toBe('v1');
    expect(resolveFwPalette({ VITE_FW_PALETTE: 'legacy' })).toBe('legacy');
    expect(() => resolveFwPalette({ VITE_FW_PALETTE: 'neon' })).toThrow(/VITE_FW_PALETTE must be one of v1, legacy/);
    expect(makeDefine('production', { VITE_FW_PALETTE: 'legacy' })['process.env.VITE_FW_PALETTE']).toBe('"legacy"');
  });

  it('configures the shared Sass module of every style with the palette', () => {
    const options = { mode: 'production', outDir: 'dist/test', publicDir: false };
    const additionalData = () =>
      (commonViteConfig(options).css.preprocessorOptions.scss as { additionalData: string }).additionalData;

    expect(additionalData()).toContain('@use "@/styles/common.scss" as * with ($fw-palette: "v1");');
    process.env.VITE_FW_PALETTE = 'legacy';
    expect(additionalData()).toContain('@use "@/styles/common.scss" as * with ($fw-palette: "legacy");');
    process.env.VITE_FW_PALETTE = 'Legacy';
    expect(() => commonViteConfig(options)).toThrow(/VITE_FW_PALETTE/);
    expect(() => compile('a { b: c; }', 'neon' as Palette)).toThrow(/VITE_FW_PALETTE must be v1 or legacy/);
  });

  it('compiles every style of the app with either palette', () => {
    for (const palette of ['v1', 'legacy'] as const) expect(Object.keys(builds[palette]).length).toBeGreaterThan(200);
  });
});

// [name, value common.scss shipped (cc5d8abe), Neon Glass token, role]
const LEGACY_NAMES = [
  ['pink-lavender-color', '#bb77ff', 'var(--fw-link)', 'text'],
  ['purple-color', 'rgba(119, 0, 238, 1)', 'var(--fw-fill-top)', 'fill'],
  ['pink-purple-color', 'rgba(119, 0, 238, 0.25)', 'var(--fw-select-fill)', 'fill'],
  ['plain-white', 'rgba(255, 255, 255, 1)', 'var(--fw-text-1)', 'text'],
  ['default-white', 'rgba(255, 255, 255, 0.75)', 'var(--fw-text-1)', 'text'],
  ['grayish-white', 'rgba(255, 255, 255, 0.65)', 'var(--fw-text-2)', 'text'],
  ['grayish-white-2', '#ffffff80', 'var(--fw-text-2)', 'text'],
  ['gray-color', 'rgba(255, 255, 255, 0.5)', 'var(--fw-text-2)', 'text'],
  ['gray-2-color', 'rgba(255, 255, 255, 0.3)', 'var(--fw-text-3)', 'text'],
  ['pink-color', '#ee0077', 'var(--fw-brand-text)', 'text'],
  ['orange-color', '#fc3317', 'var(--fw-warning)', 'text'],
  ['simple-orange-color', '#ee7700', 'var(--fw-warning)', 'text'],
  ['success-color', '#00ee77', 'var(--fw-success)', 'text'],
  ['reject-color', '#ed0e0e', 'var(--fw-danger)', 'text'],
  ['default-background-color', 'rgba(255, 255, 255, 0.1)', 'var(--fw-raised-2)', 'fill'],
  ['secondary-background-color', 'hsla(0, 0%, 100%, 0.05)', 'var(--fw-card-surface)', 'fill'],
  ['secondary-btn-color', 'hsl(0, 0%, 16%)', 'var(--fw-raised-2)', 'fill'],
  ['default-border', '1px solid rgba(255, 255, 255, 0.1)', '1px solid var(--fw-divider)', 'edge'],
  ['secondary-border', '1px solid hsla(0, 0%, 100%, 0.05)', '1px solid var(--fw-divider)', 'edge'],
] as const;
const probe = (palette: Palette) => {
  const css = compile(`.probe { ${LEGACY_NAMES.map(([name]) => `--${name}: #{$${name}};`).join(' ')} }`, palette);
  return Object.fromEntries([...css.matchAll(/--([\w-]+): ([^;]+);/g)].map(([, name, value]) => [name, value]));
};

describe('the legacy colour names (common.scss)', () => {
  it('keep exactly the values they shipped with under the legacy palette', () => {
    const shipped = compile(
      `.probe { ${LEGACY_NAMES.map(([name, value]) => `--${name}: #{${value}};`).join(' ')} }`,
      'legacy'
    );

    expect(probe('legacy')).toEqual(
      Object.fromEntries([...shipped.matchAll(/--([\w-]+): ([^;]+);/g)].map(([, name, value]) => [name, value]))
    );
  });

  it('name a declared Neon Glass token under v1', () => {
    expect(probe('v1')).toEqual(Object.fromEntries(LEGACY_NAMES.map(([name, , token]) => [name, token])));
    const effects = flat(builds.v1['src/styles/_fw-effects.scss']);
    for (const [name, , token] of LEGACY_NAMES) {
      const property = /var\((--fw-[\w-]+)\)/.exec(token)![1];
      expect(property in tokenValues || effects.includes(`${property}:`), name).toBe(true);
    }
  });

  it('give every text name AA contrast where 3.4 allows it, and never less than the shipped value had below 7:1', () => {
    const ratios = (shipped: string, token: string, background: Rgb) => ({
      v1: contrast(over(paint(token)!, background), background),
      legacy: contrast(over(paint(shipped)!, background), background),
    });

    for (const [name, shipped, token, role] of LEGACY_NAMES) {
      if (role !== 'text') continue;
      const surfaces = {
        ...SURFACES,
        ...(ON_AURORA.includes(token) && { 'raw aurora (worst)': AURORA_WORST }),
        ...(ON_SELECTION.includes(token) && { 'selected chip on glass': SELECTED_CHIP }),
      };
      for (const [surface, background] of Object.entries(surfaces)) {
        const { v1, legacy } = ratios(shipped, token, background);

        expect(v1, `${name} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        // Primary text is #EDF0FA, not pure white, to cut halation (17.06:1 on the base, design-system 0.3).
        expect(v1, `${name} on ${surface}`).toBeGreaterThanOrEqual(Math.min(legacy, 7));
      }
      // Brand, tertiary and danger text are restricted on the raw aurora; they still read better than the shipped
      // colours did there.
      if (!ON_AURORA.includes(token)) {
        const { v1, legacy } = ratios(shipped, token, AURORA_WORST);
        expect(v1, `${name} on raw aurora (worst)`).toBeGreaterThan(legacy);
      }
    }
  });

  it('labels a selected chip or row only in primary or secondary text (3.4 rule 4)', () => {
    const labels = Object.entries(builds.v1).flatMap(([block, css]) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*var\(--fw-select-fill\)[^{}]*)\}/g)].flatMap(([, selector, body]) => {
        const colour = /(?:^|;)\s*color:\s*([^;]+);/.exec(body)?.[1];
        return colour ? [`${block} ${selector.trim()}: ${colour}`] : [];
      })
    );

    expect(labels.length).toBeGreaterThan(3);
    expect(labels.filter((label) => !ON_SELECTION.some((token) => label.endsWith(token)))).toEqual([]);
  });

  it('paint every rule that sets both a text colour and a background at 4.5:1 or more', () => {
    // IrohaConnect is compiled off in release builds and keeps its own palette (decisions.md).
    const exempt = /^src\/screens\/irohaConnect\//;
    const failures: string[] = [];
    let checked = 0;

    for (const [block, css] of Object.entries(builds.v1)) {
      if (exempt.test(block)) continue;
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = Object.fromEntries(
          [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, p, v]) => [p, v])
        );
        const text = declarations.color && paint(declarations.color);
        const fill = paint(declarations['background-color'] ?? declarations.background ?? '');
        if (!text || !fill) continue;
        checked += 1;
        for (const [surface, background] of Object.entries(SURFACES)) {
          const behind = over(fill, background);
          const ratio = contrast(over(text, behind), behind);
          if (ratio < 4.5) failures.push(`${block} ${selector.trim()} over ${surface}: ${ratio.toFixed(2)}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(25);
    expect(failures).toEqual([]);
  });

  it('draw interactive boundaries with stroke.control (3:1 over the worst glass), never the 10% fill', () => {
    const stroke = paint('var(--fw-stroke-control)')!;
    expect(contrast(over(stroke, GLASS_WORST), GLASS_WORST)).toBeGreaterThanOrEqual(3);

    for (const component of ['FInput', 'FSelect', 'Dropdown', 'Switcher']) {
      const css = Object.entries(builds.v1)
        .filter(([block]) => block.startsWith(`src/components/${component}.vue#`))
        .map(([, style]) => flat(style))
        .join(' ');

      expect(css, component).toContain('border: 1px solid var(--fw-stroke-control) !important;');
      expect(css, component).not.toContain('border: 1px solid var(--fw-raised-2)');
    }
  });
});

describe('roles the legacy names did not carry', () => {
  const v1 = (block: string) => flat(builds.v1[block]);
  const legacy = (block: string) => flat(builds.legacy[block]);

  it('ring keyboard focus in accent.focus wherever a component drew its own ring in a legacy colour', () => {
    const rings = Object.entries(builds.v1).flatMap(([block, css]) =>
      [...css.matchAll(/outline: 2px solid ([^;]+);/g)].map(([, colour]) => `${block}: ${colour}`)
    );

    expect(rings.length).toBeGreaterThan(20);
    // FButton keeps a white ring inside its own fill (5.04:1 against it).
    expect(
      rings.filter((ring) => !ring.endsWith('var(--fw-focus)') && !ring.startsWith('src/components/FButton.vue'))
    ).toEqual([]);
  });

  it('fills primary actions with accent.fill under a white label, and keeps a disabled button flat', () => {
    expect(v1('src/components/FButton.vue#0')).toContain(
      '.primary { background: var(--fw-fill); color: var(--fw-on-accent); border-color: var(--fw-fill-top); }'
    );
    expect(v1('src/components/FButton.vue#0')).toMatch(
      /\.is-disabled \{ opacity: 1; background-color: var\(--fw-raised-2\) !important; border-color: var\(--fw-raised-2\) !important; background-image: none !important; color: var\(--fw-text-3\) !important; \}/
    );
    expect(legacy('src/components/FButton.vue#0')).toContain(
      '.primary { background: rgb(228.48, 0, 114.24); color: white; border-color: rgb(228.48, 0, 114.24); }'
    );
    expect(legacy('src/components/FButton.vue#0')).toContain(
      '.is-disabled { opacity: 0.7; background-color: #f8087b !important; border-color: #f8087b !important; }'
    );
    // White on accent.fill at its lightest stop.
    expect(contrast([255, 255, 255], solid('--fw-fill-top'))).toBeGreaterThanOrEqual(5.04 - 0.005);
    expect(v1('src/screens/main/MenuItem.vue#0')).toContain('background: var(--fw-fill);');
  });

  it('writes errors in status.danger and actions in text.link, never in the brand pink', () => {
    for (const block of [
      'src/screens/securityNotice/SecurityNotice.vue#0',
      'src/screens/securityNotice/SecurityNoticeGuide.vue#0',
      'src/screens/addWallet/universalWalletMigration/UniversalWalletMigration.vue#0',
    ]) {
      expect(v1(block), block).toMatch(/__(vault-)?error \{[^}]*color: var\(--fw-danger\);/);
    }
    expect(v1('src/screens/wallet&asset/wallet/Currencies.vue#0')).toMatch(
      /\.portfolio-refresh \{[^}]*color: var\(--fw-link\);/
    );
  });

  it('pairs aqua and orange price changes with a decorative triangle, and keeps the shipped colours on legacy', () => {
    const modifiers = v1('src/styles/modificators.scss');
    expect(modifiers).toContain('.up-price { color: var(--fw-up); }');
    expect(modifiers).toContain('.down-price { color: var(--fw-down); }');
    expect(modifiers).toContain('.up-price:first-child::before { content: "▲ "; content: "▲ "/""; }');
    expect(modifiers).toContain('.down-price:first-child::before { content: "▼ "; content: "▼ "/""; }');
    expect(v1('src/screens/main/WalletBalance.vue#0')).toMatch(
      /\.up-percent::before \{ content: "▲ "; content: "▲ "\/""; \}/
    );
    expect(legacy('src/styles/modificators.scss')).toBe(
      '.up-price { color: rgba(126, 222, 155, 0.75); } .down-price { color: #d0021b; }'
    );
  });

  it('makes the card surface glass at Full and Lite, and opaque at Reduced and on Calm screens', () => {
    const effects = v1('src/styles/_fw-effects.scss');

    expect(effects).toContain(':root { --fw-card-surface: var(--fw-glass); }');
    expect(effects).toContain('[data-fw-effects=reduced], .fw-calm { --fw-card-surface: var(--fw-raised); }');
    expect(legacy('src/styles/_fw-effects.scss')).not.toContain('--fw-card-surface');
  });

  it('paints the startup surface and its retry action from the tokens', async () => {
    await startWallet(() => Promise.reject(new Error('module unavailable')));
    const surface = document.querySelector<HTMLElement>('[data-testid="walletStartup"]')!;
    const retry = surface.querySelector('button')!;

    expect(surface.style.color).toBe('var(--fw-text-1)');
    expect(surface.style.fontFamily).toBe('var(--fw-font-body)');
    expect(retry.style.background).toContain('var(--fw-fill)');
  });
});
