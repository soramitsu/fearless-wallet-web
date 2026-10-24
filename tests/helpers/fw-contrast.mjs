// Test-only port of root c550ae4 shared contrast evaluator. Recipe math stays aligned with the shared gate.
// CSS-declared semantic colours and primary gradient come from compiled Sass; recipe-only values use JSON.
import assert from 'node:assert/strict';

export function parsePaint(value) {
  const hex = /^#([a-f0-9]{6})$/iu.exec(value);
  if (hex) return { bytes: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), alpha: 1 };
  const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\s*\)$/u.exec(value);
  assert.ok(rgb, `Unsupported compiled colour ${value}`);
  return { bytes: rgb.slice(1, 4).map(Number), alpha: Number(rgb[4]) };
}

export function readTokens(text) {
  const tokens = JSON.parse(text);
  assert.equal(tokens.$extensions.fw.format, 'fearless.design-tokens');
  assert.equal(tokens.$extensions.fw.version, 1);
  const entries = (group) => Object.entries(group).filter(([key]) => !key.startsWith('$'));
  const color = (value) => {
    assert.match(value.hex, /^#[A-F0-9]{6}$/u);
    return { bytes: [1, 3, 5].map((i) => parseInt(value.hex.slice(i, i + 2), 16)), alpha: value.alpha ?? 1 };
  };
  const semantic = entries(tokens.color.semantic).map(([key, token]) => {
    const css = token.$extensions.fw.css;
    const value = tokens.actualCss && css ? parsePaint(tokens.actualCss.standard[css]) : color(token.$value);
    return { key, css, ...value };
  });
  const highContrast = entries(tokens.color.highContrast).map(([key, token]) => {
    const css = tokens.color.semantic[key].$extensions.fw.css;
    const value = tokens.actualCss && css ? parsePaint(tokens.actualCss.high[css]) : color(token.$value);
    return { key, ...value };
  });
  const gradients = entries(tokens.gradient).map(([key, token]) => ({
    key,
    stops: token.$value.map((stop) => ({ position: stop.position, ...color(stop.color) })),
  }));
  if (tokens.actualCss) {
    const fill = tokens.actualCss.standard['--fw-fill'];
    const parsed = /^linear-gradient\(180deg,\s*(#[A-F0-9]{6}) 0%,\s*(#[A-F0-9]{6}) 100%\)$/iu.exec(fill);
    assert.ok(parsed, 'Primary gradient must retain its declared direction and complete stop inventory');
    gradients.find((g) => g.key === 'primaryFill').stops = [0, 1].map((position) => ({
      position,
      ...parsePaint(parsed[position + 1]),
    }));
  }
  return {
    semantic,
    highContrast,
    gradients,
    containerAlpha: {
      status: tokens.color.statusContainerAlpha.default.$value,
      info: tokens.color.statusContainerAlpha.info.$value,
    },
  };
}

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const luminance = (rgb) => rgb.map((v) => linear(v / 255)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

// Machado 2009, severity 1.0; same matrices and D65 CIE76 method as the approved fw_contrast.py.
const MATRICES = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
function lab(rgb) {
  const [r, g, b] = rgb.map(linear);
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE76(a, b, simulation = 'normal') {
  const simulate = (rgb) => {
    const normalized = rgb.map((v) => v / 255);
    if (simulation === 'normal') return normalized;
    assert.ok(MATRICES[simulation], `Unknown CVD simulation ${simulation}`);
    const channels = normalized.map(linear);
    return MATRICES[simulation].map((row) => gamma(row.reduce((s, v, i) => s + v * channels[i], 0)));
  };
  const [x, y] = [a, b].map((rgb) => lab(simulate(rgb)));
  return Math.hypot(...x.map((v, i) => v - y[i]));
}

export function resolver(tokens, config, highContrast = false, alphaEncoding = 'source') {
  const model = readTokens(JSON.stringify(tokens));
  const colors = new Map(model.semantic.map((c) => [c.key, c]));
  if (highContrast) for (const c of model.highContrast) colors.set(c.key, c);
  const alpha = (v) => {
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, 'Invalid composite alpha');
    return alphaEncoding === 'byte' ? Math.round(v * 255) / 255 : v;
  };
  const opaque = (rgb) => ({ rgb, alpha: 1 });
  function resolve(name, visiting = []) {
    assert.ok(!visiting.includes(name), `Cyclic recipe ${name}`);
    const next = [...visiting, name];
    const color = colors.get(name);
    if (color) return [{ rgb: color.bytes, alpha: alpha(color.alpha) }];
    const recipe = config.recipes[name];
    assert.ok(recipe, `Unknown recipe/token ${name}`);
    if (recipe.token) return resolve(recipe.token, next);
    if (recipe.aurora) {
      const c = tokens.color.aurora[recipe.aurora]?.$value;
      assert.ok(c && /^#[0-9A-F]{6}$/u.test(c.hex), `Unknown aurora ${recipe.aurora}`);
      return [{ rgb: [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)), alpha: alpha(c.alpha) }];
    }
    if (recipe.variants) {
      assert.ok(recipe.variants.length, `Empty recipe ${name}`);
      return recipe.variants.flatMap((n) => resolve(n, next));
    }
    if (recipe.gradient) {
      const gradient = model.gradients.find((g) => g.key === recipe.gradient);
      assert.ok(gradient, `Unknown gradient ${recipe.gradient}`);
      // Enumerate every rounded 8-bit sRGB interpolation output, including all stops.
      // Each segment has at most 3*255 channel transitions; visit both sides of every transition.
      const output = new Map();
      for (let i = 1; i < gradient.stops.length; i++) {
        const [a, b] = [gradient.stops[i - 1], gradient.stops[i]];
        assert.equal(a.alpha, 1);
        assert.equal(b.alpha, 1);
        const positions = new Set([0, 1]);
        for (let c = 0; c < 3; c++) {
          const d = b.bytes[c] - a.bytes[c];
          for (let k = Math.min(a.bytes[c], b.bytes[c]); k < Math.max(a.bytes[c], b.bytes[c]); k++) {
            const t = (k + 0.5 - a.bytes[c]) / d;
            positions.add(t);
            positions.add(Math.max(0, t - 1e-10));
            positions.add(Math.min(1, t + 1e-10));
          }
        }
        for (const t of positions) {
          const rgb = a.bytes.map((v, c) => Math.round(v + (b.bytes[c] - v) * t));
          output.set(rgb.join(','), opaque(rgb));
        }
      }
      return [...output.values()];
    }
    assert.ok(recipe.over && recipe.background, `Invalid recipe ${name}`);
    return resolve(recipe.background, next).flatMap((bg) => {
      assert.equal(bg.alpha, 1, `Backdrop ${recipe.background} must be opaque`);
      return resolve(recipe.over, next).map((fg) => {
        const opacity = recipe.alphaSource ? model.containerAlpha[recipe.alphaSource] : recipe.alpha;
        return opaque(over(fg.rgb, opacity === undefined ? fg.alpha : alpha(opacity), bg.rgb));
      });
    });
  }
  return resolve;
}

// These placement rules do not become optional when a ratio happens to pass.
function placement(group) {
  if (group.kind !== 'text') return;
  for (const bg of group.backgrounds)
    for (const fg of group.foregrounds) {
      if (bg === 'aurora')
        assert.ok(
          ['textPrimary', 'textSecondary', 'textLink', 'info', 'priceUp', 'priceDown', 'success', 'warning'].includes(
            fg
          ),
          'Forbidden text on raw aurora'
        );
      if (['chromeSurface', 'chromeSolidSurface'].includes(bg))
        assert.ok(!['textTertiary', 'textBrand'].includes(fg), 'Forbidden text on chrome');
      if (['elevatedSurface', 'selectedRow', 'pressed'].includes(bg))
        assert.notEqual(fg, 'textBrand', 'Forbidden brand text on elevated/selected surface');
      if (['selectedChip', 'selectedTab'].includes(bg))
        assert.equal(fg, 'textPrimary', 'Selected labels require primary text');
      if (/Container(?:Calm)?$/u.test(bg))
        assert.ok(['textPrimary', 'textSecondary'].includes(fg), 'Banner text must use primary/secondary');
    }
}

export function checkContrast(tokens, config) {
  assert.equal(config.format, 'fearless.contrast-pairs');
  assert.equal(config.version, 1);
  assert.ok(config.pairs.length && config.cvd.length, 'Empty contrast inventory');
  for (const [name, maximum] of Object.entries({ magenta: 0.18, cyan: 0.12, violet: 0.16 })) {
    assert.ok(tokens.color.aurora[name].$value.alpha <= maximum, `Aurora ${name} exceeds approved alpha`);
  }
  assert.ok(config.recipes.peakAllDither.alpha <= 0.02, 'Dither exceeds approved alpha');
  const ids = new Set();
  for (const group of config.pairs) {
    assert.ok(group.id && !ids.has(group.id), `Duplicate/missing pair group ${group.id}`);
    ids.add(group.id);
    assert.ok(group.foregrounds.length && group.backgrounds.length, `Empty pair group ${group.id}`);
    assert.ok(['text', 'nonText'].includes(group.kind));
    assert.equal(group.minimum, group.kind === 'text' ? 4.5 : 3, 'Threshold cannot be weakened');
    placement(group);
  }
  const results = [];
  for (const high of [false, true])
    for (const encoding of ['source', 'byte']) {
      const resolve = resolver(tokens, config, high, encoding);
      for (const group of config.pairs)
        for (const fg of group.foregrounds)
          for (const bg of group.backgrounds) {
            let minimum = Infinity;
            let variants = 0;
            let worst;
            for (const b of resolve(bg)) {
              assert.equal(b.alpha, 1, `Pair backdrop ${bg} must be opaque`);
              for (const f of resolve(fg)) {
                const painted = over(f.rgb, f.alpha, b.rgb);
                const ratio = contrast(painted, b.rgb);
                variants++;
                if (ratio < minimum) {
                  minimum = ratio;
                  worst = { foreground: painted, background: b.rgb };
                }
              }
            }
            assert.ok(
              minimum >= group.minimum,
              `${group.id}: ${fg}/${bg} ${high ? 'high' : 'standard'}/${encoding} = ${minimum}, requires ${group.minimum}`
            );
            results.push({
              group: group.id,
              foreground: fg,
              background: bg,
              highContrast: high,
              alphaEncoding: encoding,
              ratio: minimum,
              variants,
              worst,
            });
          }
    }
  const resolve = resolver(tokens, config);
  const cvd = [];
  for (const pair of config.cvd) {
    assert.equal(pair.id, 'price-up-down');
    assert.equal(pair.foreground, 'priceUp');
    assert.equal(pair.background, 'priceDown');
    assert.equal(pair.minimumDeltaE76, 40, 'CVD floor cannot be weakened');
    assert.deepEqual(pair.simulations, ['protan', 'deutan']);
    for (const simulation of ['normal', ...pair.simulations, 'tritan']) {
      const distance = deltaE76(resolve(pair.foreground)[0].rgb, resolve(pair.background)[0].rgb, simulation);
      if (pair.simulations.includes(simulation))
        assert.ok(distance >= pair.minimumDeltaE76, `CVD ${pair.id}/${simulation} below floor: ${distance}`);
      cvd.push({ id: pair.id, simulation, deltaE76: distance });
    }
  }
  return { pairResults: results, cvd, limits: config.limits };
}
