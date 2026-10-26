/* global Buffer, console */
// Portfolio screenshots for the DevTools-protocol extension smoke (`solana-extension-smoke.mjs --portfolio-screenshots`).
//
// The popup is opened at the real popup size (561 x 600, `src/styles/common.scss`), offline: the smoke starts Chrome
// with every host but the public registry resolving nowhere, and this page answers image requests with generated
// placeholders and refuses everything else. The registry, prices and balances are the reviewed registry snapshot of the shared portfolio
// files plus a fixed set of holdings, injected into the popup's own stores, so every run renders the same screens
// through the real components. Each screen is checked for horizontal overflow before it is captured.
import fs from 'node:fs/promises';
import path from 'node:path';

export const POPUP_WIDTH = 561;
export const POPUP_HEIGHT = 600;
// Where a tour renders: the popup by default, or the side panel page at the panel's size (extension-smoke-side-panel.mjs).
export const POPUP_SURFACE = { page: 'popup.html', width: POPUP_WIDTH, height: POPUP_HEIGHT, name: 'popup' };

const SNAPSHOT = 'tests/fixtures/legacy-305/chains-v13.snapshot.json';
const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1 };
// What the fixture wallet holds: [network, symbol, total, transferable].
const HOLDINGS = [
  ['Polkadot', 'dot', '12.5', '4.2'],
  ['Polkadot AssetHub', 'dot', '2', '2'],
  ['Hydration', 'dot', '1.1', '1.1'],
  ['Ethereum', 'eth', '0.75', '0.75'],
  ['Arbitrum One', 'eth', '0.1', '0.1'],
  ['Ethereum', 'usdt', '40', '40'],
  ['Polkadot AssetHub', 'usdt', '5', '5'],
  ['Polygon', 'usdt', '2', '2'],
  ['Ethereum', 'usdc', '25', '25'],
  ['Kusama', 'ksm', '3', '3'],
  ['Bifrost', 'vksm', '1', '1'],
];

/** The registry and balances the popup renders: the production networks 3.0.5 loaded, one balance per asset. */
export async function portfolioFixture(root) {
  const registry = JSON.parse(await fs.readFile(path.join(root, SNAPSHOT), 'utf8'));
  const networks = registry
    .filter(({ disabled, options }) => !disabled && !options?.some((option) => String(option).toLowerCase() === 'testnet'))
    .filter(({ ecosystem }) => ['substrate', 'ethereum', 'ethereumBased'].includes(ecosystem))
    .map((network) => ({ ...network, active: true, favorite: [] }));
  const holdings = new Map(HOLDINGS.map(([network, symbol, total, transferable]) => [`${network}:${symbol}`, { total, transferable }]));

  const balances = networks.flatMap((network) =>
    network.assets.map((asset) => {
      const held = holdings.get(`${network.name}:${asset.symbol}`) ?? { total: '0', transferable: '0' };

      return {
        mainNetwork: network.name,
        groupId: asset.id,
        priceId: asset.priceId,
        symbol: asset.symbol,
        tokenName: asset.name,
        relayChain: network.options?.includes('ethereum') ? 'ethereum' : network.name,
        icon: asset.icon,
        providers: [],
        balances: [
          {
            state: 'ready',
            name: network.name.toLowerCase(),
            existentialDeposit: asset.existentialDeposit,
            type: asset.type,
            precision: asset.precision,
            icon: network.icon,
            isNative: asset.isNative,
            isUtility: asset.isUtility ?? false,
            id: asset.id,
            symbol: asset.symbol,
            currencyId: asset.currencyId,
            assetMetadataTrust: 'verified',
            assetMetadataSource: 'registry',
            priceId: asset.priceId,
            scanCoverage: 'catalogOnly',
            timestamp: Date.now(),
            ...held,
          },
        ],
      };
    })
  );
  const missing = HOLDINGS.filter(
    ([network, symbol]) => !networks.some(({ name, assets }) => name === network && assets.some((asset) => asset.symbol === symbol))
  );
  if (missing.length) throw new Error(`Portfolio fixture holdings are not in the registry: ${JSON.stringify(missing)}`);

  return { networks, balances, prices: { tokenPriceMap: PRICES, tokenPriceChange: {} } };
}

// A placeholder logo for an icon URL: a circle with the first letters of the file name.
function placeholderSvg(url) {
  const name = decodeURIComponent(url.split('/').pop()?.replace(/\.[a-z]+$/i, '') ?? '?');
  const label = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';
  const hue = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="hsl(${hue},55%,42%)"/><text x="32" y="39" font-family="Arial,sans-serif" font-size="${label.length > 2 ? 18 : 22}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
}

/** Answers the popup's web requests offline: generated logos for images, a refusal for anything else. */
export async function servePopupOffline(cdp, sessionId, { phishingDenyList } = {}) {
  const stop = cdp.onEvent((message) => {
    if (message.sessionId !== sessionId || message.method !== 'Fetch.requestPaused') return;

    const { requestId, request, resourceType } = message.params;
    const isImage = resourceType === 'Image' || /\.(svg|png|jpe?g|webp)(\?|$)/i.test(request.url);
    const phishingFixture = phishingDenyList && /^https:\/\/polkadot\.js\.org\/phishing\/all\/[^/]+\/all\.json$/.test(request.url);
    const reply = phishingFixture
      ? cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(phishingDenyList)).toString('base64') }, sessionId)
      : isImage
      ? cdp.send(
          'Fetch.fulfillRequest',
          {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }],
            body: Buffer.from(placeholderSvg(request.url)).toString('base64'),
          },
          sessionId
        )
      : cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);

    reply.catch(() => undefined);
  });

  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'http://*' }, { urlPattern: 'https://*' }] }, sessionId);

  return stop;
}

/** The popup's Vue app, router and Pinia stores, from the page. */
export const APP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config.globalProperties.$pinia;
  return app && pinia ? { app, router: app.config.globalProperties.$router, pinia } : undefined;
})()`;

/** Horizontal overflow at the popup width: the page itself, and any row or sheet wider than its box. */
const OVERFLOW = `(() => {
  const issues = [];
  const viewport = window.innerWidth;
  if (document.documentElement.scrollWidth > viewport) issues.push('page ' + document.documentElement.scrollWidth + ' > ' + viewport);
  for (const element of document.querySelectorAll('.token-row, .token-header, .network-row, .token-actions, .view-controls, .picker, .picker-option, .layout-note, .network-section, .asset-row, .send-note')) {
    const box = element.getBoundingClientRect();
    if (element.scrollWidth > element.clientWidth + 1) issues.push(element.className + ' scrolls ' + element.scrollWidth + ' > ' + element.clientWidth);
    if (box.width > 0 && box.right > viewport + 1) issues.push(element.className + ' ends at ' + Math.round(box.right) + ' > ' + viewport);
  }
  return issues;
})()`;

/**
 * The glyph check of design-system 7.1 in the real build: the fonts Chrome drew the screen's text with
 * (`CSS.getPlatformFontsForNode`), summed per family. Every glyph must come from a face the extension bundles; a
 * system font here means a bundled face lacks a character the screen prints.
 */
export async function fontsOnScreen(cdp, sessionId, evaluate) {
  const marked = await evaluate(
    cdp,
    sessionId,
    `(() => {
      let count = 0;
      for (const element of document.querySelectorAll('body *')) {
        const text = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const box = element.getBoundingClientRect();
        if (text && box.width > 0 && box.height > 0) element.setAttribute('data-fw-glyph-probe', String(count++));
      }
      return count;
    })()`
  );
  await cdp.send('DOM.enable', {}, sessionId);
  await cdp.send('CSS.enable', {}, sessionId);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 }, sessionId);
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-fw-glyph-probe]' }, sessionId);
  const families = new Map();

  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }, sessionId);
    for (const { familyName, isCustomFont, glyphCount } of fonts) {
      const key = `${familyName}${isCustomFont ? '' : ' (system)'}`;
      families.set(key, (families.get(key) ?? 0) + glyphCount);
    }
  }
  await evaluate(
    cdp,
    sessionId,
    `(document.querySelectorAll('[data-fw-glyph-probe]').forEach((element) => element.removeAttribute('data-fw-glyph-probe')), true)`
  );

  return { elements: marked, families: Object.fromEntries([...families].sort((a, b) => b[1] - a[1])) };
}

export async function capturePortfolioScreenshots({
  cdp,
  extensionId,
  controlSession,
  outputDir,
  root,
  helpers: { evaluate, waitForExpression, extensionSend, sleep },
  password,
  walletAddress,
  surface = POPUP_SURFACE,
}) {
  const fixture = await portfolioFixture(root);
  // The seeded wallet is a returning user's: past the welcome stories, and the wallet on screen.
  await extensionSend(cdp, controlSession, 'pri(onboarding.setComplete)', null);
  await extensionSend(cdp, controlSession, 'pri(accounts.update.current)', { address: walletAddress, walletEcosystem: 'substrate' });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  const shots = [];

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  // The popup decides it is a popup from its width at load, so the size is set before it loads.
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: surface.width, height: surface.height, deviceScaleFactor: 2, mobile: false },
    sessionId
  );
  const stopServing = await servePopupOffline(cdp, sessionId);

  try {
    await cdp.send('Page.navigate', { url: `chrome-extension://${extensionId}/${surface.page}` }, sessionId);
    await waitForExpression(cdp, sessionId, `Boolean(${APP})`, 'popup Vue app');

    // The auto-lock may still show Unlock: unlock through the background and leave it.
    const onUnlock = await evaluate(cdp, sessionId, `${APP}.router.currentRoute.value.name === 'Unlock'`).catch(() => false);
    if (onUnlock) await extensionSend(cdp, controlSession, 'pri(keyring.unlock)', { password });

    await waitForExpression(cdp, sessionId, `${APP}.pinia._s.get('accounts').selectedWallet.address !== ''`, 'the wallet on screen');

    // The offline background cannot load balances, so the stores get the fixture and keep it.
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

    const capture = async (name, description) => {
      await sleep(400);
      const overflow = await evaluate(cdp, sessionId, OVERFLOW);
      if (overflow.length) throw new Error(`${name}: content wider than the ${surface.width}px ${surface.name}:\n${overflow.join('\n')}`);
      const fonts = await fontsOnScreen(cdp, sessionId, evaluate);
      const system = Object.keys(fonts.families).filter((family) => family.endsWith(' (system)'));
      if (system.length) throw new Error(`${name}: text drawn with system fonts ${system.join(', ')}: ${JSON.stringify(fonts)}`);
      description = `${description} Fonts drawn: ${Object.entries(fonts.families).map(([family, glyphs]) => `${family} ${glyphs}`).join(', ')}.`;

      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const file = path.join(outputDir, `${name}.png`);

      await fs.writeFile(file, Buffer.from(data, 'base64'));
      shots.push({ file, description });
      console.info(`[extension-smoke] portfolio screenshot ${file}`);
    };
    const click = (selector) =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) throw new Error('Not on screen: ' + ${JSON.stringify(selector)});
          element.scrollIntoView({ block: 'center' });
          element.click();
          return true;
        })()`
      );
    const scrollTo = (selector) =>
      evaluate(cdp, sessionId, `(document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'start' }), true)`);

    await fs.mkdir(outputDir, { recursive: true });
    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="portfolioTokenList"]\'))', 'By token list');

    await capture('01-by-token-first-open', 'Default By token lens after an upgrade, with the one-time layout note.');

    await click('[data-testid="layoutNoteDismiss"]');
    await click('[data-token="group:dot"] [data-testid="tokenGroupHeader"]');
    await scrollTo('[data-token="group:dot"]');
    await capture('02-dot-group-expanded', 'The DOT row expanded: each network with its role, Send and Receive for the group.');

    await click('[data-token="group:usdt"] [data-testid="tokenGroupHeader"]');
    await scrollTo('[data-token="group:usdt"]');
    await capture('03-usdt-group-and-bridged-row', 'Issuer-native USDT combined; bridged Polygon USDT stays its own row.');

    await click('[data-token="group:dot"] [data-testid="groupSend"]');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="groupNetworkPicker"]\'))', 'Send network picker');
    await capture('04-send-choose-network', 'Send from the DOT row asks for the network first, with the wrong-network warning.');
    await click('[data-testid="groupNetworkPickerClose"]');

    await click('[data-token="group:dot"] [data-testid="groupReceive"]');
    await capture('05-receive-choose-network', 'Receive from the DOT row lists every DOT network of the wallet.');

    await click('[data-testid="groupNetworkOption"][data-network="Polkadot AssetHub"]');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="receiveOnlyOnNetwork"]\'))', 'Receive on AssetHub');
    await capture('06-receive-on-assethub', 'Receive opened on the network picked: "Only send DOT on Polkadot AssetHub".');

    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-token="group:usdt"]\'))', 'By token list again');
    await click('[data-token="group:usdt"] [data-testid="groupSend"]');
    await click('[data-testid="groupNetworkOption"][data-network="Ethereum"]');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="sendGroupNetworkWarning"]\'))', 'Send on Ethereum');
    await capture('07-send-usdt-on-ethereum', 'Send opened on Ethereum for USDT, with the several-networks warning.');

    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="portfolioLens-network"]\'))', 'lens switch');
    await click('[data-testid="portfolioLens-network"]');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="portfolioNetworkList"]\'))', 'By network list');
    await capture('08-by-network', 'The By network lens, kept per wallet.');

    await click('[data-testid="portfolioLens-token"]');
    await click('[data-testid="filterBtn"] button');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="tokenRowSwitch"]\'))', 'Manage in By token');
    await capture('09-manage-by-token', 'Manage in By token: one switch per token, per-network switches inside.');
    await click('[data-testid="filterBtn"] button');
    await waitForExpression(cdp, sessionId, '!document.querySelector(\'[data-testid="tokenRowSwitch"]\')', 'Manage closed');

    // The longest locale of the popup: Russian text must fit the same width.
    const switched = await evaluate(
      cdp,
      sessionId,
      // As LanguagePopup does: the locale, and the document language that :lang() styles follow.
      `(() => { const i18n = ${APP}.app.config.globalProperties.$i18n; i18n.locale = 'ru-RU'; document.documentElement.lang = 'ru-RU'; return i18n.locale === 'ru-RU'; })()`
    );
    if (!switched) throw new Error('Could not switch the popup to Russian');
    await scrollTo('[data-token="group:dot"]');
    await waitForExpression(cdp, sessionId, 'document.body.innerText.includes("По токенам")', 'Russian By token list');
    await capture('10-by-token-russian', `Russian at the ${surface.name} width: the DOT row with each network's role and note.`);
    await click('[data-token="group:dot"] [data-testid="groupSend"]');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="groupNetworkPicker"]\'))', 'Russian Send picker');
    await capture('11-send-choose-network-russian', 'Russian Send picker: the network is chosen explicitly, with the warning.');
    await click('[data-testid="groupNetworkPickerClose"]');

    // The ancient-script locales: their signs must come from the bundled Noto faces, the rest from Inter.
    for (const [shot, locale, sign, description] of [
      ['12-by-token-akkadian', 'akk-Xsux-x-old', '\\u{12000}-\\u{1254F}', 'Old Akkadian in cuneiform, drawn with the bundled Noto Sans Cuneiform.'],
      ['13-by-token-egyptian', 'egy-Egyp', '\\u{13000}-\\u{1345F}', 'Egyptian in hieroglyphs, drawn with the bundled Noto Sans Egyptian Hieroglyphs.'],
    ]) {
      await evaluate(
        cdp,
        sessionId,
        `(${APP}.app.config.globalProperties.$i18n.locale = '${locale}', document.documentElement.lang = '${locale}', true)`
      );
      await scrollTo('[data-token="group:dot"]');
      await waitForExpression(cdp, sessionId, `/[${sign}]/u.test(document.body.innerText)`, `${locale} text`);
      await capture(shot, description);
    }

    await fs.writeFile(
      path.join(outputDir, 'README.md'),
      `# Portfolio at the ${surface.name} size (${surface.width} x ${surface.height}, device scale 2)\n\n` +
        'Captured offline by `node scripts/solana-extension-smoke.mjs --portfolio-screenshots <dir>` from the test build. ' +
        'Registry: the reviewed snapshot in `tests/fixtures/legacy-305`; logos are generated placeholders.\n\n' +
        shots.map(({ file, description }) => `- \`${path.basename(file)}\`: ${description}`).join('\n') +
        '\n'
    );

    return shots;
  } catch (error) {
    // Leave what the popup showed, so a failed run can be read without rerunning it.
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
