/* global Buffer, console */
// Effects-tier screenshots for the DevTools-protocol extension smoke (`solana-extension-smoke.mjs --effects-screenshots`).
//
// Opens the seeded wallet's popup at 561 x 600, offline (see extension-smoke-portfolio.mjs), once per effects tier
// and system setting of design-system 2.1-2.2, and checks in the real build what each screenshot shows: the
// `data-fw-effects` / `data-fw-contrast` attributes, that they were on <html> before the app mounted, and how the
// backdrop is painted (aurora, flat or removed). The choice itself is made through Settings → Appearance and
// read back from `chrome.storage.local`, so the stored record and its localStorage mirror are exercised too.
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { APP, POPUP_HEIGHT, POPUP_WIDTH, portfolioFixture, servePopupOffline } from './extension-smoke-portfolio.mjs';

const PREFERENCE_KEY = 'visualEffectsPreference';
const MIRROR_KEY = 'ui_visual-effects-v1';

// Records, from the first script of every document, when <html> gets its tier and when the startup surface or
// the app first appears, so "applied before mount" is measured rather than assumed.
const BOOT_PROBE = `(() => {
  const order = (window.__fwBoot = []);
  const mark = (event) => order.includes(event) || order.push(event);
  new MutationObserver((records) => {
    // Records arrive in the order the DOM changed, even when one callback receives several.
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-fw-effects') mark('attributes');
      for (const node of record.addedNodes) if (node.dataset?.testid === 'walletStartup') mark('startup');
    }
    if (document.querySelector('#app')?.__vue_app__) mark('mounted');
  }).observe(document, { attributes: true, attributeFilter: ['data-fw-effects'], childList: true, subtree: true });
})()`;

const STATE = `(() => {
  const backdrop = document.querySelector('.fw-backdrop');
  const style = backdrop && getComputedStyle(backdrop);
  return {
    effects: document.documentElement.dataset.fwEffects,
    contrast: document.documentElement.dataset.fwContrast,
    backdrop: !style ? 'missing' : style.display === 'none' ? 'removed' : style.backgroundImage.includes('radial-gradient') ? 'aurora' : 'flat',
    // The App root (also #app) inside the mount container carries the class; the backdrop is its first child.
    calm: backdrop?.parentElement?.classList.contains('fw-calm') ?? false,
    transition: getComputedStyle(document.querySelector('#app')).transitionDuration,
    boot: window.__fwBoot,
  };
})()`;

// A spot of bare page near the magenta aurora blob (15% / 12%), between the total and the portfolio card.
const BACKDROP_SPOT = { x: 8, y: 128 };
const BG_BASE = [0x0a, 0x0c, 0x1b];

/** The first pixel of an 8-bit RGB(A) PNG, so the backdrop is checked as painted, not only as styled. */
function firstPixel(png) {
  const width = png.readUInt32BE(16);
  const channels = { 2: 3, 6: 4 }[png[25]];
  if (png[24] !== 8 || !channels) throw new Error('Unexpected screenshot format');
  const chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  // Every PNG filter predicts the first pixel of the first row from zeros, so its bytes follow the filter byte.
  const rows = inflateSync(Buffer.concat(chunks));
  if (rows.length < 1 + width * channels) throw new Error('Short screenshot');
  return [...rows.subarray(1, 4)];
}

const VARIANTS = [
  {
    name: '01-full',
    description: 'Automatic at Full: aurora backdrop.',
    expect: { effects: 'full', contrast: 'standard', backdrop: 'aurora' },
  },
  {
    name: '02-lite',
    description: 'Lite picked in Settings: aurora kept, no blur.',
    preference: 'lite',
    expect: { effects: 'lite', contrast: 'standard', backdrop: 'aurora' },
  },
  {
    name: '03-reduced',
    description: 'Reduced picked in Settings: flat bg.base, no aurora.',
    preference: 'reduced',
    expect: { effects: 'reduced', contrast: 'standard', backdrop: 'flat' },
  },
  {
    name: '04-system-reduced-transparency',
    description: 'System "Reduce transparency" (Chrome 118+) under Automatic: Reduced.',
    media: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    requires: '(prefers-reduced-transparency: reduce)',
    expect: { effects: 'reduced', contrast: 'standard', backdrop: 'flat' },
  },
  {
    name: '05-system-high-contrast',
    description: 'System "Increase contrast": high-contrast tokens and Reduced paint, even with Lite picked.',
    preference: 'lite',
    media: [{ name: 'prefers-contrast', value: 'more' }],
    expect: { effects: 'reduced', contrast: 'high', backdrop: 'flat' },
  },
  {
    name: '06-forced-colors',
    description: 'Forced colours: the backdrop is removed and the system colours paint the page.',
    media: [{ name: 'forced-colors', value: 'active' }],
    expect: { effects: 'reduced', contrast: 'standard', backdrop: 'removed' },
  },
  {
    name: '07-reduced-motion',
    description: 'System "Reduce motion": tier unchanged, transitions cut to 0.01 ms.',
    media: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    expect: { effects: 'full', contrast: 'standard', backdrop: 'aurora', reducedMotion: true },
  },
];

export async function captureEffectsScreenshots({
  cdp,
  extensionId,
  controlSession,
  outputDir,
  root,
  password,
  walletAddress,
  helpers: { evaluate, waitForExpression, extensionSend, sleep },
}) {
  const fixture = await portfolioFixture(root);
  await extensionSend(cdp, controlSession, 'pri(onboarding.setComplete)', null);
  await extensionSend(cdp, controlSession, 'pri(accounts.update.current)', {
    address: walletAddress,
    walletEcosystem: 'substrate',
  });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  const shots = [];
  const results = [];

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT_PROBE }, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: POPUP_WIDTH, height: POPUP_HEIGHT, deviceScaleFactor: 2, mobile: false },
    sessionId
  );
  const stopServing = await servePopupOffline(cdp, sessionId);
  const stored = () =>
    evaluate(
      cdp,
      controlSession,
      `chrome.storage.local.get(${JSON.stringify(PREFERENCE_KEY)}).then((items) => items[${JSON.stringify(PREFERENCE_KEY)}] ?? null)`
    );
  const supported = (query) => evaluate(cdp, sessionId, `matchMedia(${JSON.stringify(query)}).media !== 'not all'`);

  const open = async (route = 'Currencies') => {
    await cdp.send('Page.navigate', { url: `chrome-extension://${extensionId}/popup.html` }, sessionId);
    await waitForExpression(cdp, sessionId, `Boolean(${APP})`, 'popup Vue app');
    const onUnlock = await evaluate(cdp, sessionId, `${APP}.router.currentRoute.value.name === 'Unlock'`).catch(
      () => false
    );
    if (onUnlock) await extensionSend(cdp, controlSession, 'pri(keyring.unlock)', { password });
    await waitForExpression(
      cdp,
      sessionId,
      `${APP}.pinia._s.get('accounts').selectedWallet.address !== ''`,
      'the wallet on screen'
    );
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const { pinia } = ${APP};
        const accounts = pinia._s.get('accounts');
        const networks = pinia._s.get('networks');
        const fixture = ${JSON.stringify(fixture)};
        networks.setNetworks({ networks: fixture.networks });
        networks.setPrices(fixture.prices);
        accounts.setBalance({ details: fixture.balances });
        accounts.setIsBalanceLoading(false);
        networks.setNetworks = () => undefined;
        networks.setPrices = () => undefined;
        accounts.setBalance = () => undefined;
        accounts.setIsBalanceLoading = () => undefined;
        return true;
      })()`
    );
    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: ${JSON.stringify(route)} }).then(() => true)`);
  };
  const capture = async (name, description) => {
    await sleep(400);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(outputDir, `${name}.png`);

    await fs.writeFile(file, Buffer.from(data, 'base64'));
    shots.push({ file, description });
    console.info(`[extension-smoke] effects screenshot ${file}`);
  };
  const backdropPixel = async () => {
    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', clip: { ...BACKDROP_SPOT, width: 1, height: 1, scale: 1 } },
      sessionId
    );
    return firstPixel(Buffer.from(data, 'base64'));
  };
  const check = (name, state, expected) => {
    const problems = [];
    const [red, green, blue] = state.pixel ?? [];
    const distance = state.pixel ? Math.max(...state.pixel.map((value, index) => Math.abs(value - BG_BASE[index]))) : 0;

    // Painted, not only styled: the aurora tints the bare page magenta; flat is bg.base exactly (within rounding).
    if (expected.backdrop === 'aurora' && !(red - BG_BASE[0] >= 12 && blue - BG_BASE[2] >= 6 && green <= 20)) {
      problems.push(`aurora not visible at ${JSON.stringify(BACKDROP_SPOT)}: ${state.pixel}`);
    }
    if (expected.backdrop === 'flat' && state.pixel && distance > 3) problems.push(`not flat bg.base: ${state.pixel}`);

    for (const key of ['effects', 'contrast', 'backdrop']) {
      if (state[key] !== expected[key]) problems.push(`${key} is ${state[key]}, expected ${expected[key]}`);
    }
    if (typeof expected.calm === 'boolean' && state.calm !== expected.calm) problems.push(`calm is ${state.calm}`);
    if (expected.reducedMotion && !/^(1e-05s|0\.00001s)$/.test(state.transition))
      problems.push(`transition ${state.transition}`);
    // The tier is on <html> before the startup surface, and so before the app mounts.
    if (JSON.stringify(state.boot) !== JSON.stringify(['attributes', 'startup', 'mounted'])) {
      problems.push(`boot order ${JSON.stringify(state.boot)}`);
    }
    if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
  };
  const choose = async (preference) => {
    const current = await evaluate(
      cdp,
      sessionId,
      `JSON.parse(localStorage.getItem(${JSON.stringify(MIRROR_KEY)}) ?? '{"value":"auto"}').value`
    );
    if (current === preference) return;
    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'Settings' }).then(() => true)`);
    await waitForExpression(
      cdp,
      sessionId,
      `Boolean(document.querySelector('[data-testid="visualEffects-${preference}"] input'))`,
      'Visual effects'
    );
    await evaluate(
      cdp,
      sessionId,
      `(document.querySelector('[data-testid="visualEffects-${preference}"] input').click(), true)`
    );
    await waitForExpression(
      cdp,
      sessionId,
      `localStorage.getItem(${JSON.stringify(MIRROR_KEY)}) === ${JSON.stringify(JSON.stringify({ value: preference }))}`,
      `the ${preference} mirror`
    );
    const record = await stored();
    if (record !== preference) throw new Error(`chrome.storage.local holds ${record}, expected ${preference}`);
  };

  try {
    await fs.mkdir(outputDir, { recursive: true });
    if ((await stored()) !== null) throw new Error('The fresh profile already has a visual effects record');

    for (const variant of VARIANTS) {
      await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
      await open();
      if (variant.requires && !(await supported(variant.requires))) {
        console.info(`[extension-smoke] skipped ${variant.name}: this Chrome does not support ${variant.requires}`);
        results.push({ name: variant.name, skipped: `unsupported ${variant.requires}` });
        continue;
      }
      await choose(variant.preference ?? 'auto');
      await cdp.send('Emulation.setEmulatedMedia', { features: variant.media ?? [] }, sessionId);
      // Reopen: the stored choice and the system settings are resolved before mount.
      await open();
      await waitForExpression(
        cdp,
        sessionId,
        'Boolean(document.querySelector(\'[data-testid="portfolioTokenList"]\'))',
        'By token list'
      );
      const state = { ...(await evaluate(cdp, sessionId, STATE)), pixel: await backdropPixel() };
      check(variant.name, state, variant.expect);
      await capture(variant.name, variant.description);

      // The Send network picker's scrim: live blur only at Full; Lite, Reduced and forced colours have none.
      await evaluate(
        cdp,
        sessionId,
        // The DOT row stays expanded once opened (it is a per-wallet view setting).
        `(() => {
          const send = () => document.querySelector('[data-token="group:dot"] [data-testid="groupSend"]');
          if (!send()) document.querySelector('[data-token="group:dot"] [data-testid="tokenGroupHeader"]').click();
          return new Promise((resolve) => requestAnimationFrame(() => resolve(send().click() ?? true)));
        })()`
      );
      await waitForExpression(
        cdp,
        sessionId,
        'Boolean(document.querySelector(\'[data-testid="groupNetworkPickerBackdrop"]\'))',
        'Send network picker'
      );
      state.scrim = await evaluate(
        cdp,
        sessionId,
        `getComputedStyle(document.querySelector('[data-testid="groupNetworkPickerBackdrop"]')).backdropFilter`
      );
      const scrim = state.effects === 'full' ? 'blur(5px)' : 'none';
      if (state.scrim !== scrim) throw new Error(`${variant.name}: picker scrim ${state.scrim}, expected ${scrim}`);
      await capture(`${variant.name}-picker`, `${variant.description} Send network picker over its scrim.`);
      await evaluate(
        cdp,
        sessionId,
        `(document.querySelector('[data-testid="groupNetworkPickerClose"]').click(), true)`
      );
      results.push({ name: variant.name, ...state });
    }

    // A system change while the popup is open applies at once, without a reload.
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
    await open();
    await choose('auto');
    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-contrast', value: 'more' }] },
      sessionId
    );
    await waitForExpression(
      cdp,
      sessionId,
      'document.documentElement.dataset.fwContrast === "high"',
      'live high contrast'
    );
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
    await waitForExpression(
      cdp,
      sessionId,
      'document.documentElement.dataset.fwContrast === "standard"',
      'live standard contrast'
    );
    results.push({ name: 'live-contrast-change', applied: true });

    // Calm: password, keys and signing screens stay flat whatever the tier.
    await open('SettingsChangePassword');
    const calm = await evaluate(cdp, sessionId, STATE);
    check('08-calm-change-password', calm, { effects: 'full', contrast: 'standard', backdrop: 'flat', calm: true });
    results.push({ name: '08-calm-change-password', ...calm });
    await capture('08-calm-change-password', 'A Calm route (Change password) at Full: the backdrop is flat.');

    // The control itself, in English and Russian.
    await open('Settings');
    await waitForExpression(
      cdp,
      sessionId,
      'Boolean(document.querySelector(\'[data-testid="visualEffectsSetting"]\'))',
      'Appearance'
    );
    await evaluate(
      cdp,
      sessionId,
      '(document.querySelector(\'[data-testid="visualEffectsSetting"]\').scrollIntoView({ block: "center" }), true)'
    );
    await capture('09-settings-appearance', 'Settings → Appearance → Visual effects, Automatic.');
    // As LanguagePopup does: the locale, and the document language that :lang() styles follow.
    await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = 'ru-RU', document.documentElement.lang = 'ru-RU', true)`);
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-contrast', value: 'more' }] },
      sessionId
    );
    await evaluate(
      cdp,
      sessionId,
      '(document.querySelector(\'[data-testid="visualEffects-lite"] input\').click(), true)'
    );
    await waitForExpression(
      cdp,
      sessionId,
      'Boolean(document.querySelector(\'[data-testid="visualEffectsContrastNote"]\'))',
      'contrast note'
    );
    await evaluate(
      cdp,
      sessionId,
      '(document.querySelector(\'[data-testid="visualEffectsSetting"]\').scrollIntoView({ block: "center" }), true)'
    );
    await capture(
      '10-settings-appearance-russian-contrast',
      'Russian, Lite picked while the system asks for more contrast: the note explains Reduced.'
    );
    const overflow = await evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll('[data-testid="visualEffectsSetting"] *')].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className)`
    );
    if (overflow.length) throw new Error(`Visual effects control overflows: ${overflow.join(', ')}`);

    await fs.writeFile(
      path.join(outputDir, 'README.md'),
      `# Effects tiers at the popup size (${POPUP_WIDTH} x ${POPUP_HEIGHT}, device scale 2)\n\n` +
        'Captured offline by `node scripts/solana-extension-smoke.mjs --effects-screenshots <dir>` from the test build. ' +
        'Each screenshot was checked for its `data-fw-effects`/`data-fw-contrast`, the backdrop paint and the boot order ' +
        '(tier on <html> before the startup surface and the app); `results.json` has the measured values.\n\n' +
        shots.map(({ file, description }) => `- \`${path.basename(file)}\`: ${description}`).join('\n') +
        '\n'
    );
    await fs.writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

    return { shots, results };
  } catch (error) {
    const where = await evaluate(
      cdp,
      sessionId,
      '({ route: location.hash, text: document.body?.innerText.slice(0, 600) ?? "" })'
    ).catch(() => ({}));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId).catch(() => ({}));

    await fs.mkdir(outputDir, { recursive: true });
    if (data) await fs.writeFile(path.join(outputDir, 'failure.png'), Buffer.from(data, 'base64'));
    error.message = `${error.message}\nPopup at ${where.route}: ${JSON.stringify(where.text)}`;
    throw error;
  } finally {
    stopServing();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
  }
}
