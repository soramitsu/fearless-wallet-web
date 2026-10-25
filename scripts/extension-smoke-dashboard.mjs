/* global Buffer, console */
// Portfolio dashboard screenshots for the DevTools-protocol extension smoke
// (`solana-extension-smoke.mjs --dashboard-screenshots`). Needs a test build, which carries the dashboard unless it was
// made with VUE_APP_PORTFOLIO_DASHBOARD=false:
//   yarn build:extension-test
//
// Same method as the portfolio screenshots: the popup is opened at the real popup size (561 x 600), offline, and the
// registry, prices and balances are injected into the popup's own stores, so every run renders the same screens through
// the real components. A second wallet is created in the real keyring; its holdings, which the offline background cannot
// load, are put into the dashboard store as the background's own answer would shape them. Besides the screenshots, the
// run checks what the screens claim: the totals, the legend, the drill-down, the sheets and the wallet picker.
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP, POPUP_HEIGHT, POPUP_WIDTH, fontsOnScreen, portfolioFixture, servePopupOffline } from './extension-smoke-portfolio.mjs';

const SECOND_WALLET_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const SECOND_WALLET_NAME = 'Savings';

// What the first wallet holds, [network, symbol, total]; the fixture's own amounts are replaced so the fan has a shape.
const MAIN_HOLDINGS = [
  ['Polkadot', 'dot', '220'],
  ['Polkadot AssetHub', 'dot', '40'],
  ['Ethereum', 'eth', '0.6'],
  ['Ethereum', 'usdt', '700'],
  ['Ethereum', 'usdc', '400'],
  ['Kusama', 'ksm', '25'],
  ['SORA Mainnet', 'xor', '25000'],
  ['SORA Mainnet', 'val', '12000'],
  // Liberland to SORA is the one reviewed route into SORA still bundled: LLD carries the route checks.
  ['Liberland', 'lld', '300'],
];
// What the second wallet holds, as the background would report it.
const SAVINGS_HOLDINGS = [
  ['Polkadot', 'dot', '90'],
  ['Ethereum', 'eth', '0.4'],
  ['Ethereum', 'usdt', '250'],
];
const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1, sora: 0.02, 'sora-validator-token': 0.01, 'liberland-lld': 0.5 };
// LLD's row on Liberland (it is in no token group, so the row is named by its asset key), and LLD on SORA.
const LLD_ROW = 'tokenRow-substrate:6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6';
const SORA_LLD = '1c3b4fcb-5a5f-4319-9dce-d178006eb9bf';
const PRICE_CHANGES = { polkadot: 2.5, ethereum: -1.2 };

const assetKey = (network, asset) =>
  [network.ecosystem, network.chainId || network.name, asset.id].map((part) => encodeURIComponent(String(part).toLowerCase())).join(':');
// The currency symbol arrives from the background a moment after the page loads, so the checks compare the number.
const dollars = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fundMain(fixture) {
  const held = new Map(MAIN_HOLDINGS.map(([network, symbol, total]) => [`${network}:${symbol}`, total]));

  fixture.balances.forEach((group) => {
    group.balances.forEach((balance) => {
      const total = held.get(`${group.mainNetwork}:${group.symbol}`);

      Object.assign(balance, total ? { total, transferable: total } : { total: '0', transferable: '0' });
    });
  });
  fixture.prices = { tokenPriceMap: PRICES, tokenPriceChange: PRICE_CHANGES };

  return MAIN_HOLDINGS.reduce((sum, [network, symbol, total]) => {
    const asset = fixture.networks.find(({ name }) => name === network).assets.find((candidate) => candidate.symbol === symbol);

    return sum + Number(total) * PRICES[asset.priceId];
  }, 0);
}

/** A wallet's answer, shaped as `pri(accounts.portfolioHoldings)` reports it. */
function walletAnswer(fixture, address, held) {
  const holdings = held.map(([networkName, symbol, amount]) => {
    const network = fixture.networks.find(({ name }) => name === networkName);
    const asset = network.assets.find((candidate) => candidate.symbol === symbol);
    const price = PRICES[asset.priceId];
    const change = PRICE_CHANGES[asset.priceId];

    return {
      key: assetKey(network, asset),
      symbol: asset.symbol.toUpperCase(),
      name: asset.name,
      networkName,
      amount,
      transferable: amount,
      fiat: String(Number(amount) * price),
      changePercent: change === undefined ? null : String(change),
    };
  });
  const total = holdings.reduce((sum, { fiat }) => sum + Number(fiat), 0);
  const changeAmount = holdings.reduce((sum, { fiat, changePercent }) => {
    const percent = Number(changePercent ?? 0);

    return sum + Number(fiat) - Number(fiat) / (1 + percent / 100);
  }, 0);

  return {
    total,
    answer: {
      address,
      total: String(total),
      changeAmount: changeAmount.toFixed(4),
      changePercent: ((changeAmount / (total - changeAmount)) * 100).toFixed(4),
      hiddenCount: 0,
      unpricedCount: 0,
      unavailableCount: 0,
      poolStakesExcluded: false,
      holdings,
      latestTimestamp: Date.now() - 20_000,
      staleNetworks: [],
    },
  };
}

/** Horizontal overflow at the popup width: the dashboard's own boxes may not end beyond the viewport. */
const OVERFLOW = `(() => {
  const issues = [];
  const viewport = window.innerWidth;
  if (document.documentElement.scrollWidth > viewport) issues.push('page ' + document.documentElement.scrollWidth + ' > ' + viewport);
  for (const element of document.querySelectorAll('.hero-card, .hero-text, .legend, .actions, .segmented, .row-head, .child, .section-head, .sheet, .scope-row, .all-panel, .where, .head, .holding, .panel, .actions, .action, .polkaswap, .route, .orbit, .check')) {
    const box = element.getBoundingClientRect();
    // The legend scrolls sideways by design: its own box must fit, the chips inside it may run past the edge.
    const inLegend = Boolean(element.closest('.legend'));
    if (box.width > 0 && !inLegend && box.right > viewport + 1) issues.push(element.className + ' ends at ' + Math.round(box.right) + ' > ' + viewport);
    if (!inLegend && element.scrollWidth > element.clientWidth + 1) issues.push(element.className + ' scrolls ' + element.scrollWidth + ' > ' + element.clientWidth);
  }
  return issues;
})()`;

export async function captureDashboardScreenshots({
  cdp,
  extensionId,
  controlSession,
  outputDir,
  root,
  helpers: { evaluate, waitForExpression, extensionSend, sleep },
  password,
  walletAddress,
}) {
  const fixture = await portfolioFixture(root);
  const mainTotal = fundMain(fixture);

  await extensionSend(cdp, controlSession, 'pri(onboarding.setComplete)', null);
  const savingsAddress = await extensionSend(cdp, controlSession, 'pri(accounts.create)', {
    meta: { name: SECOND_WALLET_NAME, whenCreated: 2 },
    suri: SECOND_WALLET_MNEMONIC,
    type: 'sr25519',
    walletEcosystem: 'substrate',
  });
  await extensionSend(cdp, controlSession, 'pri(accounts.update.current)', { address: walletAddress, walletEcosystem: 'substrate' });

  // The background answers the new message in the real extension: one entry per wallet it keeps balances for.
  const backgroundAnswer = await extensionSend(cdp, controlSession, 'pri(accounts.portfolioHoldings)', null);
  const listed = Array.isArray(backgroundAnswer) ? backgroundAnswer : [];
  const shapeProblems = listed.flatMap((entry) =>
    ['address', 'total', 'changeAmount', 'changePercent'].filter((field) => typeof entry[field] !== 'string')
      .concat(Array.isArray(entry.holdings) ? [] : ['holdings'], Array.isArray(entry.staleNetworks) ? [] : ['staleNetworks'])
  );
  if (!Array.isArray(backgroundAnswer) || shapeProblems.length) {
    throw new Error(`pri(accounts.portfolioHoldings) answered ${JSON.stringify(backgroundAnswer).slice(0, 400)}: ${shapeProblems.join(', ')}`);
  }

  const savings = walletAnswer(fixture, savingsAddress, SAVINGS_HOLDINGS);
  const main = walletAnswer(fixture, walletAddress, MAIN_HOLDINGS);
  const allTotal = mainTotal + savings.total;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  const shots = [];
  const checks = [];

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: POPUP_WIDTH, height: POPUP_HEIGHT, deviceScaleFactor: 2, mobile: false }, sessionId);
  const stopServing = await servePopupOffline(cdp, sessionId);
  const evalPage = (expression) => evaluate(cdp, sessionId, expression);
  const wait = (expression, label) => waitForExpression(cdp, sessionId, expression, label);
  const check = async (label, expression, expected) => {
    const actual = await evalPage(expression);

    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, the popup says ${JSON.stringify(actual)}`);
    checks.push(label);
  };
  const click = (selector) =>
    evalPage(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Not on screen: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center' });
      element.click();
      return true;
    })()`);
  const scrollTop = () => evalPage(`(document.querySelector('.wallet--dashboard')?.scrollTo(0, 0), true)`);
  const capture = async (name, description) => {
    await sleep(450);
    const overflow = await evalPage(OVERFLOW);
    if (overflow.length) throw new Error(`${name}: content wider than the ${POPUP_WIDTH}px popup:\n${overflow.join('\n')}`);
    const fonts = await fontsOnScreen(cdp, sessionId, evaluate);
    const system = Object.keys(fonts.families).filter((family) => family.endsWith(' (system)'));
    if (system.length) throw new Error(`${name}: text drawn with system fonts ${system.join(', ')}: ${JSON.stringify(fonts)}`);

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(outputDir, `${name}.png`);

    await fs.writeFile(file, Buffer.from(data, 'base64'));
    shots.push({ file, description });
    console.info(`[extension-smoke] dashboard screenshot ${file}`);
  };

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await cdp.send('Page.navigate', { url: `chrome-extension://${extensionId}/popup.html` }, sessionId);
    await wait(`Boolean(${APP})`, 'popup Vue app');
    const onUnlock = await evalPage(`${APP}.router.currentRoute.value.name === 'Unlock'`).catch(() => false);
    if (onUnlock) await extensionSend(cdp, controlSession, 'pri(keyring.unlock)', { password });
    await wait(`${APP}.pinia._s.get('accounts').selectedWallet.address !== ''`, 'the wallet on screen');
    await wait(`${APP}.pinia._s.get('accounts').accounts.length === 2`, 'both wallets in the popup');
    // The dashboard store exists once the wallet screen's header has mounted.
    await wait(`${APP}.pinia._s.has('portfolioDashboard')`, 'the dashboard store');

    await evalPage(`(() => {
      const { pinia } = ${APP};
      const accounts = pinia._s.get('accounts');
      const networks = pinia._s.get('networks');
      const dashboard = pinia._s.get('portfolioDashboard');
      const fixture = ${JSON.stringify(fixture)};

      networks.setNetworks({ networks: fixture.networks });
      networks.setPrices(fixture.prices);
      accounts.setBalance({ details: fixture.balances });
      accounts.setIsBalanceLoading(false);
      networks.setNetworks = () => undefined;
      networks.setPrices = () => undefined;
      accounts.setBalance = () => undefined;
      accounts.setIsBalanceLoading = () => undefined;

      // The offline background cannot load balances: its answer, for every wallet, is what the background would send.
      dashboard.refresh = () => Promise.resolve();
      dashboard.setScope('all');
      dashboard.setLens('token');
      return true;
    })()`);
    // A read the real background started before the stub may still be on its way: what it answers is not what the offline
    // popup should show, so the injected answers go in again once it has landed.
    const injectHoldings = () =>
      evalPage(`(() => {
        const dashboard = ${APP}.pinia._s.get('portfolioDashboard');

        dashboard.holdings = [${JSON.stringify(main.answer)}, ${JSON.stringify(savings.answer)}];
        dashboard.readAt = Date.now();
        dashboard.status = 'ready';
        return true;
      })()`);
    await injectHoldings();
    await sleep(1500);
    await injectHoldings();

    await evalPage(`${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await wait(`Boolean(document.querySelector('[data-testid="portfolioHero"]'))`, 'the dashboard hero');
    await wait(`Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'the All wallets token list');

    // All wallets: the header names it, the total is the sum of both wallets, the legend and the list agree.
    await check('the header names All wallets', `document.querySelector('[data-testid="walletNameHeader"]')?.innerText`, 'All wallets');
    await check('the total is the sum of both wallets', `document.querySelector('[data-testid="heroTotal"]')?.getAttribute('aria-label').includes(${JSON.stringify(dollars(allTotal))})`, true);
    await check('the sync chip says live', `document.querySelector('[data-testid="heroSync"]')?.innerText.trim().toLowerCase()`, 'live');
    await check('the Wallets lens exists only in All wallets', `[...document.querySelectorAll('[data-testid^="allLens-"]')].map((button) => button.dataset.testid)`, ['allLens-token', 'allLens-network', 'allLens-wallet']);
    const legendShares = await evalPage(`[...document.querySelectorAll('[data-testid="heroLegend"] .chip-share')].map((node) => parseInt(node.innerText, 10))`);
    const shareSum = legendShares.reduce((sum, share) => sum + share, 0);
    if (Math.abs(shareSum - 100) > legendShares.length) throw new Error(`The legend shares add up to ${shareSum}, not 100: ${JSON.stringify(legendShares)}`);
    checks.push('the legend shares add up to the whole');
    await capture('01-all-wallets-tokens', 'All wallets by token: the winged sun with the allocation fan, the legend, and the tokens of every wallet.');

    // Drill-down: the first pick highlights, the second opens the row.
    const firstChip = await evalPage(`document.querySelector('[data-testid="heroLegend"] .chip').dataset.testid.replace('legend-', '')`);
    await click(`[data-testid="legend-${firstChip}"]`);
    await check('a chip highlights its group', `[document.querySelector('[data-testid="legend-${firstChip}"]').getAttribute('aria-pressed'), document.querySelector('[data-testid="portfolioSky"]').classList.contains('sky--has-selection')]`, ['true', true]);
    await capture('02-chip-highlighted', 'A legend chip picked: its rays lift and the rest of the fan steps back.');
    await click(`[data-testid="legend-${firstChip}"]`);
    await wait(`Boolean(document.querySelector('.row--active'))`, 'the opened row');
    await capture('03-token-row-opened', 'The same chip picked again opens that token: where it lives, by network and wallet.');

    await click('[data-testid="allLens-network"]');
    await wait(`Boolean(document.querySelector('[data-testid="allNetworks"]'))`, 'the Networks lens');
    await scrollTop();
    await capture('04-all-wallets-networks', 'All wallets by network: each network with its holdings and the wallet that holds them.');

    await click('[data-testid="allLens-wallet"]');
    await wait(`Boolean(document.querySelector('[data-testid="allWalletRows"]'))`, 'the Wallets lens');
    await check('the Wallets lens lists both wallets, largest first', `[...document.querySelectorAll('[data-testid="allWalletRows"] .title')].map((node) => node.innerText)`, ['Solana Smoke', SECOND_WALLET_NAME]);
    await scrollTop();
    await capture('05-all-wallets-wallets', 'All wallets by wallet: each wallet with its share, networks and age, and a way to open it alone.');

    await click('[data-testid="heroHowWeCount"]');
    await wait(`Boolean(document.querySelector('[data-testid="portfolioCountingSheet"]'))`, 'the how-we-count sheet');
    await check('the counting sheet adds the All wallets rule', `Boolean(document.querySelector('[data-testid="countingAllWalletsRule"]'))`, true);
    await capture('06-how-we-count', 'How we count: the contract in plain words, and what is not included right now.');
    await click('[data-testid="portfolioSheetClose"]');
    await wait(`!document.querySelector('[data-testid="portfolioCountingSheet"]')`, 'the sheet closed');

    await click('[data-testid="heroSync"]');
    await wait(`Boolean(document.querySelector('[data-testid="portfolioSyncSheet"]'))`, 'the sync sheet');
    await capture('07-sync-state', 'Balance status: live, with every wallet updated in the last 15 minutes.');
    await evalPage(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), document.querySelector('[data-testid="portfolioSyncSheet"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`);
    await wait(`!document.querySelector('[data-testid="portfolioSyncSheet"]')`, 'Escape closes the sheet');
    checks.push('Escape closes a sheet');

    // The honest states: a wallet whose balances are old, then a network that did not answer, then no connection.
    const aged = savings.answer.latestTimestamp - 3 * 60 * 60 * 1000;
    await evalPage(`(() => { const dashboard = ${APP}.pinia._s.get('portfolioDashboard'); dashboard.holdings = dashboard.holdings.map((entry) => entry.address === ${JSON.stringify(savingsAddress)} ? { ...entry, latestTimestamp: ${aged} } : entry); return true; })()`);
    await wait(`/saved/i.test(document.querySelector('[data-testid="heroSync"]')?.innerText ?? '')`, 'the saved state');
    await check('an old balance reads as saved, with its age', `/3h/i.test(document.querySelector('[data-testid="heroSync"]').innerText)`, true);
    await scrollTop();
    await capture('08-saved-balances', 'A wallet whose balances are three hours old: the chip says Saved with the age, never Live.');

    await evalPage(`(() => { const dashboard = ${APP}.pinia._s.get('portfolioDashboard'); dashboard.holdings = dashboard.holdings.map((entry) => entry.address === ${JSON.stringify(savingsAddress)} ? { ...entry, latestTimestamp: Date.now() - 20000, staleNetworks: ['Polkadot'] } : entry); return true; })()`);
    await wait(`/partial/i.test(document.querySelector('[data-testid="heroSync"]')?.innerText ?? '')`, 'the partial state');
    await click('[data-testid="heroSync"]');
    await wait(`Boolean(document.querySelector('[data-testid="syncNetworks"]'))`, 'the failed network named');
    await check('the sheet names the network that did not answer', `document.querySelector('[data-testid="syncNetworks"]').innerText.trim()`, 'Polkadot');
    await capture('09-partial-balances', 'A network that did not answer is named, and the status is Partial.');
    await click('[data-testid="portfolioSheetClose"]');
    await evalPage(`(() => { const dashboard = ${APP}.pinia._s.get('portfolioDashboard'); dashboard.holdings = dashboard.holdings.map((entry) => ({ ...entry, staleNetworks: [], latestTimestamp: Date.now() - 20000 })); return true; })()`);


    // ---- Where it lives (phase P1): readiness chips, the screen for one token, the Swap and Move hand-offs ----------
    const features = (change) =>
      evalPage(`(() => { const extension = ${APP}.pinia._s.get('extension'); extension.features = { ...(extension.features ?? { fiat: {} }), actions: { ...(extension.features?.actions ?? {}), ...${JSON.stringify(change)} } }; return true; })()`);
    const lens = (value) => evalPage(`(() => { const dashboard = ${APP}.pinia._s.get('portfolioDashboard'); dashboard.setScope('all'); dashboard.setLens('${value}'); return true; })()`);
    // The dock's first tab is the Wallet: it returns to the screen the person was on there (each tab keeps its own history).
    const dockWallet = () => evalPage(`(document.querySelectorAll('[data-testid="menu"] button')[0].click(), true)`);
    // The header's back button, as on every screen that has a way back.
    const headerBack = async () => {
      const present = await evalPage(`Boolean(document.querySelector('[data-testid="backBtn"]'))`);
      if (!present) throw new Error('There is no back button on ' + (await evalPage(`${APP}.router.currentRoute.value.fullPath`)));
      // The test id lands on the button's wrapper; the click handler is on the button inside it.
      await click('[data-testid="backBtn"] button');
      await sleep(500);
    };

    await lens('token');
    await features({ polkaswap: true, crossChainXcm: false, crossChainSoraBridge: false, crossChainLiberland: false });
    await wait(`Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'the token list');
    await check('a token on SORA is swap-ready, with the words and an icon', `document.querySelector('[data-testid="tokenRow-substrate:7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5:b774c386-5cce-454a-a845-1ec0381538ec"] [data-testid="readiness-ready"]')?.innerText.trim()`, 'Swap-ready');
    await check('LLD on Liberland, whose reviewed route to SORA is turned off in this version, says Moves paused', `document.querySelector('[data-testid^="${LLD_ROW}"] [data-testid="readiness-off"]')?.innerText.trim()`, 'Moves paused');
    await check('KSM, whose routes to SORA are retired, has no chip', `document.querySelectorAll('[data-testid="tokenRow-group:ksm"] [data-testid^="readiness-"], [data-testid^="tokenRow-substrate:b0a8d493"] [data-testid^="readiness-"]').length`, 0);
    await click('[data-testid="tokenRow-group:usdt"]');
    await check('USDT, which has no route to SORA, has no chip on any of its holdings', `document.querySelectorAll('[data-testid="tokenChildren-group:usdt"] [data-testid^="readiness-"]').length`, 0);
    await click('[data-testid="tokenRow-group:usdt"]');
    await evalPage(`(document.querySelector('[data-testid^="${LLD_ROW}"]')?.scrollIntoView({ block: 'center' }), true)`);
    await capture('13-readiness-chips', 'The tokens with how each stands to a swap: Swap-ready on SORA, Moves paused where a reviewed route exists but is off (LLD on Liberland), nothing where there is no route.');

    // DOT lives on two networks in two wallets: open it, then Where it lives. Its routes to SORA are retired.
    const dotRow = await evalPage(`(() => { const row = [...document.querySelectorAll('[data-testid^="tokenRow-group:dot"]')][0]; return row?.dataset.testid ?? null; })()`);
    if (!dotRow) throw new Error('The DOT row is not on screen');
    await click(`[data-testid="${dotRow}"]`);
    await click(`[data-testid="whereItLives-group:dot"]`);
    await wait(`Boolean(document.querySelector('[data-testid="tokenLocations"]'))`, 'Where it lives');
    await wait(`Boolean(document.querySelector('[data-testid="locationsHoldings"] [data-testid^="holding-"]'))`, 'the holdings');
    await check('Where it lives names the token and its holdings across wallets and networks', `[document.querySelector('.head-symbol')?.innerText, document.querySelectorAll('[data-testid="locationsHoldings"] [data-testid^="holding-"]').length]`, ['DOT', 3]);
    await check('the orbit has one satellite per network', `document.querySelectorAll('[data-testid^="satellite-"]').length`, 2);
    await check('the breakdown adds up: transferable plus the rest is the total counted', `(() => { const read = (id) => parseFloat(document.querySelector('[data-testid="' + id + '"]').innerText.replace(/,/g, '')); return Math.abs(read('breakdownTransferable') + read('breakdownHeld') - read('breakdownTotal')) < 0.0002; })()`, true);
    await check('DOT has no reviewed route to SORA, and the route card says so', `[document.querySelector('[data-testid="portfolioRouteCard"] .lead')?.innerText.trim(), document.querySelectorAll('[data-testid="routeHops"] li').length]`, ['No route yet', 0]);
    await check('without a route Send comes first, and nothing offers a move', `[document.querySelector('[data-testid="action-send"]')?.innerText.trim(), Boolean(document.querySelector('[data-testid="action-move"]')), Boolean(document.querySelector('[data-testid="action-receiveOnSora"]'))]`, ['Send', false, false]);
    await check('the Polkaswap card says moves are off and swaps are on', `[document.querySelector('[data-testid="check-moves"]')?.dataset.ok, document.querySelector('[data-testid="check-swaps"]')?.dataset.ok]`, ['false', 'true']);
    await capture('14-where-it-lives-dot', 'Where it lives for DOT: the orbit, its holdings in both wallets, the breakdown, the route card saying there is no route, and the Polkaswap card.');
    await evalPage(`(document.querySelector('[data-testid="holdingPanel"]')?.scrollIntoView({ block: 'start' }), true)`);
    await capture('14b-where-it-lives-panel', 'The holding picked: its breakdown with a pattern bar, the route card, and its actions, Send first.');
    await evalPage(`(document.querySelector('[data-testid="polkaswapCard"]')?.scrollIntoView({ block: 'start' }), true)`);
    await capture('14c-polkaswap-card', 'The Polkaswap card: the checks behind a swap, with words as well as marks, and one way in.');
    await headerBack();
    await wait(`${APP}.router.currentRoute.value.name === 'Currencies' && Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'back on the token list from DOT');

    // LLD on Liberland keeps a reviewed route to SORA: one move, paused in this version, so Receive on SORA comes first.
    await click(`[data-testid^="${LLD_ROW}"]`);
    await wait(`Boolean(document.querySelector('[data-testid="tokenLocations"]'))`, 'Where it lives for LLD');
    await wait(`Boolean(document.querySelector('[data-testid="holdingPanel"]'))`, 'the LLD holding');
    await check('the route card says the move is paused, and names it', `[document.querySelector('[data-testid="portfolioRouteCard"] .lead')?.innerText.trim(), [...document.querySelectorAll('[data-testid="routeHops"] .hop-path')].map((hop) => hop.innerText.trim())]`, ['Moves paused', ['Liberland → SORA Mainnet']]);
    await check('a paused move is shown as unavailable, with its reason', `[document.querySelector('[data-testid="action-move"]')?.disabled, document.querySelector('[data-testid="action-move"]')?.innerText.trim(), document.querySelector('[data-testid="actionReason"]')?.innerText.trim()]`, [true, 'Move unavailable', 'Cross-network moves are turned off in this version.']);
    await check('Receive on SORA is offered instead, because a reviewed route names the asset there', `Boolean(document.querySelector('[data-testid="action-receiveOnSora"]'))`, true);
    await capture('14d-where-it-lives-lld', 'Where it lives for LLD on Liberland: one reviewed move to SORA, paused in this version, and Receive on SORA offered instead.');

    // Receive on SORA opens Receive for the SORA asset the route delivers: the person can ask for it to be sent there.
    await click('[data-testid="action-receiveOnSora"]');
    await wait(`${APP}.router.currentRoute.value.name === 'ReceiveForm'`, 'the Receive screen');
    await check(
      'Receive on SORA opens Receive for the SORA asset the route delivers, on the SORA network',
      `(() => { const { assetId, network } = ${APP}.router.currentRoute.value.params; return [assetId, /^SORA/.test(network)]; })()`,
      [SORA_LLD, true]
    );
    await wait(`Boolean(document.querySelector('[data-testid="receiveNetworkChip"]'))`, 'the network on the Receive screen');
    await check('the Receive screen names SORA as the network', `/SORA/.test(document.querySelector('[data-testid="receiveNetworkChip"]').innerText)`, true);
    await capture('14e-receive-on-sora', 'Receive on SORA instead: the Receive screen opened for LLD on SORA, the asset the reviewed route delivers.');
    await evalPage(`(${APP}.router.back(), true)`);
    await wait(`${APP}.router.currentRoute.value.name === 'TokenLocations'`, 'back on Where it lives from Receive');
    await wait(`Boolean(document.querySelector('[data-testid="holdingPanel"]'))`, 'the holding panel again');
    checks.push('Receive on SORA returns to Where it lives');

    // The same screen once moves are on: a route with one move, and a Move sheet that hands off to the cross-chain screen.
    await features({ crossChainLiberland: true });
    await wait(`document.querySelector('[data-testid="action-move"]')?.disabled === false`, 'the move enabled');
    await check('with moves on the chip counts the move', `document.querySelector('[data-testid="holdingPanel"] [data-testid="readiness-route"]')?.innerText.trim()`, '1 move');
    await click('[data-testid="action-move"]');
    await wait(`Boolean(document.querySelector('[data-testid="portfolioMoveSheet"]'))`, 'the Move sheet');
    await check('the Move sheet names where from and where to, and the route', `[document.querySelector('[data-testid="moveFrom"] strong')?.innerText, document.querySelector('[data-testid="moveTo"] strong')?.innerText]`, ['Liberland', 'SORA Mainnet']);
    await capture('15-move-sheet', 'The Move sheet: from, to, the reviewed route, time, fee and minimum, and the button that hands over to the review screen.');
    await click('[data-testid="moveReview"]');
    await wait(`${APP}.router.currentRoute.value.name === 'CrossChain'`, 'the cross-chain screen');
    await check('the move hands over with the network and asset already chosen', `(() => { const { originChainId, assetKey } = ${APP}.router.currentRoute.value.query; return [originChainId.slice(0, 8), assetKey.startsWith('substrate:6bd89e05')]; })()`, ['6bd89e05', true]);
    await features({ crossChainLiberland: false });
    await dockWallet();
    await wait(`${APP}.router.currentRoute.value.name === 'TokenLocations'`, 'the Wallet tab back on Where it lives');
    checks.push('the Wallet tab returns to Where it lives after a hand-off');
    await headerBack();
    await wait(`${APP}.router.currentRoute.value.name === 'Currencies' && Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'the header back on the token list');
    checks.push('the header back leaves Where it lives for the list');

    // A token on SORA is swap-ready: the Swap sheet picks the pair and hands over to Polkaswap.
    await click(`[data-testid="tokenRow-substrate:7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5:b774c386-5cce-454a-a845-1ec0381538ec"]`);
    await wait(`Boolean(document.querySelector('[data-testid="tokenLocations"]'))`, 'Where it lives for XOR');
    await wait(`Boolean(document.querySelector('[data-testid="action-swap"]'))`, 'the swap action');
    await check('a swap-ready token offers a swap first, with the Polkaswap mark', `[document.querySelector('[data-testid="action-swap"]')?.innerText.trim(), Boolean(document.querySelector('[data-testid="action-swap"] use'))]`, ['Swap XOR on Polkaswap', true]);
    await capture('16-where-it-lives-swap-ready', 'Where it lives for XOR, which is on SORA: swap-ready, with Swap on Polkaswap as the first action.');
    await click('[data-testid="action-swap"]');
    await wait(`Boolean(document.querySelector('[data-testid="portfolioSwapSheet"]'))`, 'the Swap sheet');
    await check('the Swap sheet leaves the pay asset out of the targets', `[...document.querySelectorAll('[data-testid^="swapTarget-"]')].map((target) => target.innerText.trim())`, ['VAL', 'PSWAP', 'XSTUSD']);
    await capture('17-swap-sheet', 'The Swap sheet: what you pay, popular targets, the checks, and one line saying Polkaswap shows price, fee and impact before you sign.');
    await click('[data-testid="swapTarget-PSWAP"]');
    await click('[data-testid="swapOpen"]');
    await wait(`${APP}.router.currentRoute.value.name === 'Polkaswap'`, 'the Polkaswap screen');
    await check('the swap hands over the pair, never an amount', `(() => { const { from, to } = ${APP}.router.currentRoute.value.query; return [from, to.slice(0, 8)]; })()`, ['b774c386-5cce-454a-a845-1ec0381538ec', '37a999a2']);
    await wait(`/XOR/i.test(document.body.innerText) && /PSWAP/i.test(document.body.innerText)`, 'the pair on the Polkaswap screen');
    checks.push('the Polkaswap screen opens with the pair chosen');
    await dockWallet();
    await wait(`${APP}.router.currentRoute.value.name === 'TokenLocations'`, 'the Wallet tab back on Where it lives');
    await headerBack();
    await wait(`${APP}.router.currentRoute.value.name === 'Currencies' && Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'back on the token list');

    // A holding in another wallet: the screen says it switches first, and does.
    await click(`[data-testid="tokenRow-group:usdt"]`);
    await click(`[data-testid="whereItLives-group:usdt"]`);
    await wait(`Boolean(document.querySelector('[data-testid="tokenLocations"]'))`, 'Where it lives for USDT');
    const otherWallet = await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-testid="locationsHoldings"] button')]; const other = rows.find((row) => /Savings/.test(row.innerText)); other?.click(); return Boolean(other); })()`);
    if (!otherWallet) throw new Error('USDT has no holding in the second wallet');
    await wait(`Boolean(document.querySelector('[data-testid="switchNote"]'))`, 'the switch note');
    await check('a holding of another wallet says it switches first, on the button too', `[document.querySelector('[data-testid="switchNote"]')?.innerText.trim(), document.querySelector('[data-testid="action-send"]')?.innerText.trim()]`, ['This is in Savings. We switch to it first and you can switch back any time.', 'Switch to Savings and send']);
    await capture('18-switch-wallet-first', 'A holding in Savings while another wallet is selected: the note, and a button that says it switches first.');
    await click('[data-testid="action-send"]');
    await wait(`${APP}.router.currentRoute.value.name === 'SendForm'`, 'the Send screen');
    await check('the wallet was switched, and Send opens for the holding', `[${APP}.pinia._s.get('accounts').selectedWallet.name, ${APP}.router.currentRoute.value.params.network]`, ['Savings', 'Ethereum']);
    await extensionSend(cdp, controlSession, 'pri(accounts.update.current)', { address: walletAddress, walletEcosystem: 'substrate' });
    await wait(`${APP}.pinia._s.get('accounts').selectedWallet.address === ${JSON.stringify(walletAddress)}`, 'the first wallet selected again');
    await evalPage(`${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await wait(`Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'back on All wallets');

    // One wallet: the second pick of a legend chip opens Where it lives for that wallet alone.
    await evalPage(`(() => { ${APP}.pinia._s.get('portfolioDashboard').setScope('wallet'); return true; })()`);
    await wait(`Boolean(document.querySelector('[data-testid="heroSwap"]'))`, 'one wallet');
    await click('[data-testid="legend-group:dot"]');
    await click('[data-testid="legend-group:dot"]');
    await wait(`${APP}.router.currentRoute.value.name === 'TokenLocations'`, 'Where it lives from the legend');
    await wait(`Boolean(document.querySelector('[data-testid="locationsHoldings"] [data-testid^="holding-"]'))`, 'the holdings of one wallet');
    await check('in one wallet Where it lives shows only that wallet', `[...new Set([...document.querySelectorAll('[data-testid="locationsHoldings"] .holding-meta > span:first-child')].map((node) => node.innerText))]`, ['Solana Smoke']);
    await capture('19-where-it-lives-one-wallet', 'Where it lives from the legend of one wallet: only that wallet holds are listed.');
    await evalPage(`${APP}.router.replace({ name: 'Currencies' }).then(() => true)`);
    await lens('token');

    // The wallet picker: All wallets first, then each wallet.
    await evalPage(`document.querySelector('.wallet-name .name').click()`);
    await wait(`Boolean(document.querySelector('[data-testid="allWalletsRow"]'))`, 'All wallets in the wallet picker');
    await check('the picker marks All wallets as selected', `document.querySelector('[data-testid="allWalletsRow"] button').getAttribute('aria-pressed')`, 'true');
    await capture('10-wallet-picker', 'The wallet picker: All wallets first, with the sum of every wallet. Offline the background has no balances, so the wallets below read zero.');

    // One wallet: the header keeps its own total and its own list, with Swap on Polkaswap.
    await evalPage(`(() => {
      const row = [...document.querySelectorAll('[data-testid="walletContent"]')].find((candidate) => candidate.querySelector('[data-testid="name"]')?.innerText.trim().toLowerCase() === 'solana smoke');
      if (!row) throw new Error('Solana Smoke is not in the wallet picker');
      row.querySelector('[data-testid="content"]').click();
      return true;
    })()`);
    await wait(`Boolean(document.querySelector('[data-testid="heroSwap"]'))`, 'one wallet with the Swap action');
    await check('one wallet reads as itself', `document.querySelector('[data-testid="walletNameHeader"]')?.innerText`, 'Solana Smoke');
    await check('one wallet keeps its own total, the fixture the popup was given', `document.querySelector('[data-testid="heroTotal"]')?.getAttribute('aria-label').includes(${JSON.stringify(dollars(mainTotal))})`, true);
    await check('Swap carries the Polkaswap mark', `document.querySelector('[data-testid="heroSwap"] use')?.getAttribute('xlink:href') ?? document.querySelector('[data-testid="heroSwap"] use')?.getAttribute('href')`, '#icon-polkaswap');
    checks.push('choosing a wallet leaves All wallets');
    await scrollTop();
    await capture('11-one-wallet', 'One wallet: its own total and portfolio list as before, the sun and legend above, and Swap on Polkaswap.');

    // The longest locale of the popup: Russian text must fit the same width.
    await evalPage(`(() => { const i18n = ${APP}.app.config.globalProperties.$i18n; i18n.locale = 'ru-RU'; document.documentElement.lang = 'ru-RU'; return i18n.locale === 'ru-RU'; })()`);
    await wait(`/общий баланс/i.test(document.body.innerText)`, 'Russian dashboard text');
    await evalPage(`(() => { const dashboard = ${APP}.pinia._s.get('portfolioDashboard'); dashboard.setScope('all'); dashboard.setLens('token'); return true; })()`);
    await wait(`Boolean(document.querySelector('[data-testid="allTokens"]'))`, 'All wallets in Russian');
    await scrollTop();
    await capture('12-all-wallets-russian', 'All wallets in Russian at the popup width.');
    await click('[data-testid="tokenRow-group:dot"]');
    await click('[data-testid="whereItLives-group:dot"]');
    await wait(`Boolean(document.querySelector('[data-testid="tokenLocations"]'))`, 'Where it lives in Russian');
    await wait(`/где хранится/i.test(document.body.innerText)`, 'Russian Where it lives text');
    await capture('20-where-it-lives-russian', 'Where it lives in Russian at the popup width.');

    await fs.writeFile(
      path.join(outputDir, 'README.md'),
      `# Portfolio dashboard at the popup size (${POPUP_WIDTH} x ${POPUP_HEIGHT}, device scale 2)\n\n` +
        'Captured offline by `node scripts/solana-extension-smoke.mjs --dashboard-screenshots <dir>` from a test build made with ' +
        '`VUE_APP_PORTFOLIO_DASHBOARD=true`. Two wallets: the first holds the fixture balances, the second is a real keyring wallet whose ' +
        'holdings are injected as the background would report them. Logos are generated placeholders. Invented amounts.\n\n' +
        shots.map(({ file, description }) => `- \`${path.basename(file)}\`: ${description}`).join('\n') +
        '\n\nChecked on the way:\n\n' +
        checks.map((label) => `- ${label}`).join('\n') +
        '\n'
    );

    return { shots, checks, background: { wallets: listed.length } };
  } catch (error) {
    const where = await evalPage('({ route: location.hash, text: document.body?.innerText.slice(0, 600) ?? "" })').catch(() => ({}));
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
