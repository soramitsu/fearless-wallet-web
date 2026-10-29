/* global Buffer */
// Chrome side panel checks for the DevTools-protocol extension smoke (`solana-extension-smoke.mjs --side-panel-screenshots`).
// Needs a test build. Headless Chrome shows extension side panels, so this runs offline like the other screenshot modes.
//
// The toolbar code is src/extension/toolbarSurface.ts. Until the panel has loaded once, the toolbar is in probe mode: no
// popup and no panel behaviour, so its click reaches the worker, which opens the panel. The toolbar is clicked through
// the DevTools protocol's Extensions.triggerAction, which runs the same path as a click on the toolbar button (pipe
// transport only). The run checks that first click, Chrome's own toggle once the panel has loaded, the real panel's size,
// the two switches in settings and the expand button, with screenshots; the portfolio tour then runs on the side panel
// page at the panel's size.
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP, servePopupOffline } from './extension-smoke-portfolio.mjs';

const TOOLBAR_STATE = `(async () => {
  const stored = await chrome.storage.local.get(['fearless:toolbar-surface', 'fearless:side-panel-status']);
  return {
    popup: (await chrome.action.getPopup({})).replace(/^chrome-extension:\\/\\/[^/]+\\//, ''),
    openPanelOnActionClick: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    surface: stored['fearless:toolbar-surface'] ?? null,
    status: stored['fearless:side-panel-status'] ?? null,
  };
})()`;

export async function checkSidePanel({
  cdp,
  extensionId,
  controlSession,
  outputDir,
  helpers: { evaluate, waitForExpression, extensionSend, sleep },
  password,
}) {
  const checks = [];
  const shots = [];
  const origin = `chrome-extension://${extensionId}/`;
  const isPanel = (target) => target.url.startsWith(`${origin}sidepanel.html`);
  const isPopup = (target) => target.type === 'page' && target.url.startsWith(`${origin}popup.html`);
  const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;
  const until = async (producer, label) => {
    const deadline = Date.now() + 15_000;
    let last;

    while (Date.now() < deadline) {
      last = await producer();
      if (last.done) return last.value;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last?.value ?? null)}`);
  };
  const appearing = (predicate, label) =>
    until(async () => {
      const found = (await targets()).find(predicate);

      return { done: Boolean(found), value: found };
    }, label);
  const gone = (predicate, label) =>
    until(async () => {
      const left = (await targets()).filter(predicate);

      return { done: left.length === 0, value: left.map(({ url }) => url) };
    }, label);
  // The worker applies a stored change a moment after it lands.
  const toolbarIs = async (label, expected) => {
    await until(async () => {
      const state = await evaluate(cdp, controlSession, TOOLBAR_STATE);

      return { done: JSON.stringify(state) === JSON.stringify(expected), value: state };
    }, label);
    checks.push(label);
  };
  const open = async (target) => {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });

    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);

    return sessionId;
  };
  const capture = async (sessionId, name, description) => {
    await sleep(450);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(outputDir, `${name}.png`);

    await fs.writeFile(file, Buffer.from(data, 'base64'));
    shots.push({ file, description });
    console.info(`[extension-smoke] side panel screenshot ${file}`);
  };
  const SWITCH = '[data-testid="settings-toolbar-surface"]';
  // The dock's Settings opens the Settings page (the header keeps its gear only where no dock is shown); the switch is
  // under Preferences.
  const openSettings = async (sessionId) => {
    await evaluate(
      cdp,
      sessionId,
      `((document.querySelector('nav.menu [data-destination=settings]') ?? document.querySelector('[data-testid="settings"] button')).click(), true)`
    );
    await waitForExpression(cdp, sessionId, `Boolean(document.querySelector('${SWITCH}'))`, 'the toolbar switch in settings');
    await evaluate(cdp, sessionId, `(document.querySelector('${SWITCH}').scrollIntoView({ block: 'center' }), true)`);

    return evaluate(cdp, sessionId, `document.querySelector('${SWITCH} strong').innerText.trim()`);
  };

  await fs.mkdir(outputDir, { recursive: true });
  await toolbarIs('before the panel has loaded, the toolbar has no popup and no panel behaviour, so its click reaches the worker', {
    popup: '',
    openPanelOnActionClick: false,
    surface: null,
    status: null,
  });

  const windowId = await evaluate(cdp, controlSession, 'chrome.windows.getCurrent().then(({ id }) => id)');
  // A fresh page: a click lends a page its activation for a few seconds, and every evaluate here is a click.
  const { targetId: freshId } = await cdp.send('Target.createTarget', { url: `${origin}smoke-control.html` });
  const freshSession = await open({ targetId: freshId });
  // Evaluated without a gesture, unlike the harness's evaluate, which would lend the page one.
  const quietly = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: false }, freshSession)).result?.value;
  await until(async () => ({ done: (await quietly('document.readyState')) === 'complete' }), 'a fresh extension page');
  const refusal = await quietly(`chrome.sidePanel.open({ windowId: ${windowId} }).then(() => 'opened', (error) => error.message)`);
  await cdp.send('Target.closeTarget', { targetId: freshId });
  if (!/user gesture/i.test(String(refusal))) throw new Error(`Chrome opened the side panel without a user gesture: ${JSON.stringify(refusal)}`);
  checks.push('without a user gesture Chrome refuses to open the panel, so the worker opens it inside the click');

  // The toolbar button, clicked always in the same tab of the browser window: the blank page Chrome started with.
  const tabs = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos;
  const toolbarTab = tabs.find((target) => target.url === 'about:blank') ?? tabs[0];
  const clickToolbar = () => cdp.send('Extensions.triggerAction', { id: extensionId, targetId: toolbarTab.targetId });
  await clickToolbar();
  const panel = await appearing(isPanel, 'the side panel the worker opened on the first click');
  checks.push('the first toolbar click reaches the worker, which opens the side panel');
  let panelSession = await open(panel);
  let stopServing = await servePopupOffline(cdp, panelSession);
  // Again with the offline answers in place, so the logos load.
  await cdp.send('Page.reload', {}, panelSession);
  await waitForExpression(cdp, panelSession, `Boolean(${APP})`, 'the side panel Vue app');
  const viewport = await evaluate(
    cdp,
    panelSession,
    '({ width: innerWidth, height: innerHeight, surface: document.documentElement.dataset.fwSurface, scrollWidth: document.documentElement.scrollWidth })'
  );
  if (viewport.surface !== 'side-panel') throw new Error(`The side panel page does not know it is the side panel: ${JSON.stringify(viewport)}`);
  if (viewport.scrollWidth > viewport.width) throw new Error(`The side panel scrolls sideways: ${JSON.stringify(viewport)}`);
  checks.push(`the side panel page knows where it is and fits the panel, ${viewport.width} x ${viewport.height}`);

  await toolbarIs('once the panel has loaded here, Chrome toggles it from the toolbar itself', {
    popup: '',
    openPanelOnActionClick: true,
    surface: null,
    status: 'working',
  });

  if (await evaluate(cdp, panelSession, `${APP}.router.currentRoute.value.name === 'Unlock'`).catch(() => false)) {
    await extensionSend(cdp, controlSession, 'pri(keyring.unlock)', { password });
  }
  await waitForExpression(cdp, panelSession, `${APP}.pinia._s.get('accounts').selectedWallet.address !== ''`, 'the wallet in the side panel');
  await waitForExpression(cdp, panelSession, `Boolean(document.querySelector('[data-testid="walletNameHeader"]'))`, 'the wallet header in the side panel');
  const header = await evaluate(
    cdp,
    panelSession,
    `({ expand: Boolean(document.querySelector('.header button.expand')), connection: Boolean(document.querySelector('.header .connection')) })`
  );
  if (!header.expand || !header.connection) throw new Error(`The side panel header lacks the expand button or the connection dot: ${JSON.stringify(header)}`);
  checks.push('the side panel header offers a full tab and shows the current site connection, like the popup');
  await capture(panelSession, '01-side-panel-wallet', `The wallet in the real side panel, ${viewport.width} x ${viewport.height}.`);

  const panelSwitch = await openSettings(panelSession);
  if (panelSwitch !== 'Switch to popup') throw new Error(`The side panel settings offer ${JSON.stringify(panelSwitch)}, not Switch to popup`);
  checks.push('settings in the side panel offer Switch to popup');
  await capture(panelSession, '02-side-panel-settings', 'Settings in the side panel, with Switch to popup.');

  // Expand opens the full tab and keeps the panel beside it.
  const tabsBefore = new Set((await targets()).map(({ targetId }) => targetId));
  await evaluate(cdp, panelSession, `(document.querySelector('.header button.expand').click(), true)`);
  const fullTab = await appearing((target) => isPopup(target) && !tabsBefore.has(target.targetId), 'the full tab');
  await sleep(500);
  if (!(await targets()).some(isPanel)) throw new Error('Expand closed the side panel');
  await cdp.send('Target.closeTarget', { targetId: fullTab.targetId });
  checks.push('expand opens the wallet in a tab and leaves the side panel open');

  // Switch to popup: the panel closes and the popup opens in its place.
  await openSettings(panelSession);
  const beforePopup = new Set((await targets()).map(({ targetId }) => targetId));
  stopServing();
  await evaluate(cdp, panelSession, `(document.querySelector('${SWITCH}').click(), true)`);
  await gone(isPanel, 'the side panel to close');
  let popup = await appearing((target) => isPopup(target) && !beforePopup.has(target.targetId), 'the popup in place of the panel');
  await toolbarIs('after Switch to popup the toolbar opens the popup', {
    popup: 'popup.html#/',
    openPanelOnActionClick: false,
    surface: 'popup',
    status: 'working',
  });

  const checkPopupHeader = async (sessionId) => {
    await waitForExpression(cdp, sessionId, `Boolean(${APP}) && Boolean(document.querySelector('[data-testid="walletNameHeader"]'))`, 'the wallet in the popup');
    const state = await evaluate(cdp, sessionId, `({
      toolbarPopup: chrome.extension.getViews({ type: 'popup' }).includes(window),
      width: innerWidth,
      expand: Boolean(document.querySelector('.header button.expand')),
      connection: Boolean(document.querySelector('.header .connection')),
    })`);
    if (!state.toolbarPopup || !state.expand || !state.connection) {
      throw new Error(`The real toolbar popup lacks its surface controls: ${JSON.stringify(state)}`);
    }
  };

  let popupSession = await open(popup);
  await checkPopupHeader(popupSession);
  await capture(popupSession, '03-popup-wallet', 'The real toolbar popup with its expand button and current-site connection indicator.');
  checks.push('the real toolbar popup has both the expand button and current-site connection indicator');

  // Expanding the popup must close that transient view, while keeping the full tab usable.
  const beforeExpand = new Set((await targets()).map(({ targetId }) => targetId));
  await evaluate(cdp, popupSession, `(document.querySelector('.header button.expand').click(), true)`);
  const expandedPopup = await appearing((target) => isPopup(target) && !beforeExpand.has(target.targetId), 'the tab expanded from the popup');
  await gone((target) => target.targetId === popup.targetId, 'the expanded popup to close');
  const expandedSession = await open(expandedPopup);
  await waitForExpression(cdp, expandedSession, `Boolean(document.querySelector('[data-testid="walletNameHeader"]'))`, 'the wallet in the expanded tab');
  const expandedState = await evaluate(cdp, expandedSession, `({
    toolbarPopup: chrome.extension.getViews({ type: 'popup' }).includes(window),
    width: innerWidth,
    expand: Boolean(document.querySelector('.header button.expand')),
  })`);
  if (expandedState.toolbarPopup || (expandedState.width > 561 && expandedState.expand)) {
    throw new Error(`The expanded tab kept the toolbar-popup identity: ${JSON.stringify(expandedState)}`);
  }
  await capture(expandedSession, '04-popup-expanded-tab', 'The wallet expanded from the popup into a full tab.');
  await cdp.send('Target.closeTarget', { targetId: expandedPopup.targetId });
  checks.push('popup expand opens a usable full tab, closes the popup, and gives the tab its own layout');

  await clickToolbar();
  popup = await appearing((target) => isPopup(target) && !beforeExpand.has(target.targetId), 'the popup reopened by the toolbar');
  popupSession = await open(popup);
  await checkPopupHeader(popupSession);
  checks.push('the toolbar reopens the saved popup mode with both header controls intact');

  // Switch to side panel, from that popup: the panel opens and the popup, which has no tab, closes.
  const popupSwitch = await openSettings(popupSession);
  if (popupSwitch !== 'Switch to side panel') throw new Error(`The popup settings offer ${JSON.stringify(popupSwitch)}, not Switch to side panel`);
  await capture(popupSession, '05-popup-settings', 'Settings in the reopened popup, with Switch to side panel.');
  await evaluate(cdp, popupSession, `(document.querySelector('${SWITCH}').click(), true)`);
  const reopened = await appearing(isPanel, 'the side panel opened from the popup');
  await gone((target) => target.targetId === popup.targetId, 'the popup to close');
  await toolbarIs('after Switch to side panel the toolbar opens the panel again', {
    popup: '',
    openPanelOnActionClick: true,
    surface: 'side-panel',
    status: 'working',
  });

  // Chrome's own toggle: the toolbar closes the open panel, then opens it again. Left closed for what runs next.
  await clickToolbar();
  await gone((target) => target.targetId === reopened.targetId, 'the toolbar to close the panel');
  await clickToolbar();
  const toggled = await appearing(isPanel, 'the toolbar to open the panel again');
  checks.push('with the panel loaded once, the toolbar button opens and closes it');
  panelSession = await open(toggled);
  await evaluate(cdp, panelSession, 'setTimeout(() => window.close(), 0), true');
  await gone(isPanel, 'the side panel to close at the end');
  await sleep(500);
  if ((await targets()).some((target) => isPopup(target) && !beforePopup.has(target.targetId) && target.targetId !== popup.targetId)) {
    throw new Error('A popup opened while the side panel worked');
  }

  await fs.writeFile(
    path.join(outputDir, 'README.md'),
    `# Fearless in Chrome's side panel (${viewport.width} x ${viewport.height})\n\n` +
      'Captured offline by `node scripts/solana-extension-smoke.mjs --side-panel-screenshots <dir>` from a test build. ' +
      '`portfolio/` holds the portfolio tour on the side panel page at the same size.\n\n' +
      shots.map(({ file, description }) => `- \`${path.basename(file)}\`: ${description}`).join('\n') +
      '\n\nChecked on the way:\n\n' +
      checks.map((label) => `- ${label}`).join('\n') +
      '\n'
  );

  return { shots, checks, viewport: { width: viewport.width, height: viewport.height } };
}
