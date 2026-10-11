/* global Buffer, console */
// Primitive screenshots for the DevTools-protocol extension smoke (`solana-extension-smoke.mjs --primitives-screenshots`).
//
// Opens the seeded wallet's popup at 561 x 600, offline (see extension-smoke-portfolio.mjs), on the screens where the
// shared primitives of design-system 10 are drawn: buttons, inputs, the amount input, sheets, dialogs, the select
// list, tabs and segmented controls, switches, checkboxes, banners and the QR tile, including two Calm screens and a
// keyboard-focused control. Nothing is submitted: the smoke only opens screens, types into a field and moves focus.
// Each capture records how the primitives on screen are painted and named (`results.json`), so the same run against
// two builds compares them in numbers as well as in pictures.
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP, POPUP_HEIGHT, POPUP_WIDTH, portfolioFixture, servePopupOffline } from './extension-smoke-portfolio.mjs';

/** Paint, size and accessible semantics of the primitives on screen; one sample per kind. */
const PRIMITIVES = `(() => {
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const first = (selector) => [...document.querySelectorAll(selector)].find(visible);
  const pick = (element, properties) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      ...Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
    };
  };
  const paint = ['background-color', 'background-image', 'color', 'border-top', 'border-radius', 'clip-path', 'box-shadow', 'filter'];
  const button = first('.el-button.button');
  const input = first('.input .el-input__inner');
  const focused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const dialog = first('.popup-background .popup-container');
  return {
    calm: Boolean(document.querySelector('.fw-calm')),
    effects: document.documentElement.dataset.fwEffects,
    button: button && { ...pick(button, paint), wrapper: pick(button.parentElement, ['filter']), text: button.textContent.trim() },
    input: input && { ...pick(input, paint), label: input.labels?.[0]?.textContent.trim() ?? null },
    focused: focused && {
      tag: focused.tagName.toLowerCase(),
      testid: focused.closest('[data-testid]')?.dataset.testid ?? null,
      focusVisible: focused.matches(':focus-visible'),
      ...pick(focused, ['outline-color', 'outline-style', 'outline-width', 'outline-offset', 'border-top']),
      wrapper: pick(focused.parentElement, ['filter']),
    },
    sheet: pick(first('.form-background:not(.form-contained) .form'), paint),
    sheetRole: document.querySelector('.form-background:not(.form-contained)')?.getAttribute('role') ?? null,
    dialog: dialog && { ...pick(dialog, paint), role: dialog.closest('[role]')?.getAttribute('role') ?? null },
    card: pick(first('.content-form'), paint),
    switch: pick(first('.switch__core'), ['background-color', 'background-image', 'border-top', 'border-radius']),
    checkbox: pick(first('.fw-checkbox__box'), ['background-color', 'background-image', 'border-top', 'border-radius']),
    tab: (() => {
      const tab = first('.tab-button');
      return tab && { ...pick(tab, paint), tag: tab.tagName.toLowerCase(), role: tab.getAttribute('role'), pressed: tab.getAttribute('aria-pressed'), selected: tab.getAttribute('aria-selected') };
    })(),
    selectRows: [...document.querySelectorAll('.select-popup .row')].filter(visible).length,
    selectRowTag: first('.select-popup .row')?.tagName.toLowerCase() ?? null,
    banner: pick(first('.alert-container'), paint),
    qr: pick(first('.qr-wrapper img'), ['border-radius']),
    corners: [...document.querySelectorAll('.FCorners > .top-left, .FCorners > .bottom-right')].filter(visible).length,
    ticks: [...document.querySelectorAll('.fw-ticks')].filter(visible).length,
  };
})()`;

export async function capturePrimitivesScreenshots({
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
  // A returning user's wallet: past the welcome stories, and the wallet on screen.
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
  // The popup decides it is a popup from its width at load, so the size is set before it loads.
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: POPUP_WIDTH, height: POPUP_HEIGHT, deviceScaleFactor: 2, mobile: false },
    sessionId
  );
  const stopServing = await servePopupOffline(cdp, sessionId);

  const route = (name) => evaluate(cdp, sessionId, `${APP}.router.replace({ name: ${JSON.stringify(name)} }).then(() => true)`);
  const waitFor = (selector, label) =>
    waitForExpression(cdp, sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, label);
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
  // A real key press first, so the focus that follows is keyboard focus (:focus-visible), as a Tab user gets it.
  const keyboardFocus = async (selector) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }, sessionId);
    }
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Not on screen: ' + ${JSON.stringify(selector)});
        element.scrollIntoView({ block: 'center' });
        element.focus();
        return document.activeElement === element;
      })()`
    );
  };
  // A group's Send and Receive show once its row is expanded; the expansion is remembered per wallet.
  const openGroupAction = async (group, action) => {
    const selector = `[data-token="group:${group}"] [data-testid="${action}"]`;
    if (!(await evaluate(cdp, sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`))) {
      await click(`[data-token="group:${group}"] [data-testid="tokenGroupHeader"]`);
      await waitFor(selector, `${group} ${action}`);
    }
    await click(selector);
  };
  const capture = async (name, description) => {
    await sleep(450);
    // Recorded rather than fatal, so a build that overflows can still be compared with one that does not.
    const pageWidth = await evaluate(cdp, sessionId, 'document.documentElement.scrollWidth');
    const primitives = { ...(await evaluate(cdp, sessionId, PRIMITIVES)), pageWidth };
    if (pageWidth > POPUP_WIDTH) console.info(`[extension-smoke] ${name}: the page is ${pageWidth}px wide in the ${POPUP_WIDTH}px popup`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(outputDir, `${name}.png`);

    await fs.writeFile(file, Buffer.from(data, 'base64'));
    shots.push({ file, description });
    results.push({ name, ...primitives });
    console.info(`[extension-smoke] primitives screenshot ${file}`);
  };

  try {
    await fs.mkdir(outputDir, { recursive: true });
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

    await route('Currencies');
    await waitFor('[data-testid="portfolioTokenList"]', 'By token list');
    if (await evaluate(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="layoutNoteDismiss"]\'))')) {
      await click('[data-testid="layoutNoteDismiss"]');
    }
    await capture('01-portfolio-controls', 'Portfolio: tab buttons, search field, icon button, lens segments and the Hide zero switch.');

    await click('[data-testid="filterBtn"] button');
    await waitFor('[data-testid="tokenRowSwitch"]', 'Manage in By token');
    await capture('02-manage-switches', 'Manage: one switch per token and per network, the filter chips.');
    await click('[data-testid="filterBtn"] button');
    await waitForExpression(cdp, sessionId, '!document.querySelector(\'[data-testid="tokenRowSwitch"]\')', 'Manage closed');

    await openGroupAction('usdt', 'groupSend');
    await click('[data-testid="groupNetworkOption"][data-network="Ethereum"]');
    await waitFor('[data-testid="amountInternal"]', 'Send on Ethereum');
    await capture('03-send-form', 'Send (a sheet): the amount input, the recipient field, the banner and the disabled primary button.');

    await keyboardFocus('[data-testid="amountInternal"]');
    await capture('04-send-amount-keyboard-focus', 'Send: the amount input focused from the keyboard.');
    await keyboardFocus('[data-testid="sendToInput"] input, [data-testid="sendToInput"] textarea');
    await capture('05-send-recipient-keyboard-focus', 'Send: the recipient field focused from the keyboard.');

    await route('Currencies');
    await waitFor('[data-token="group:dot"]', 'By token list again');
    await openGroupAction('dot', 'groupReceive');
    await click('[data-testid="groupNetworkOption"][data-network="Polkadot AssetHub"]');
    await waitFor('[data-testid="qr"] img', 'Receive QR');
    await capture('06-receive', 'Receive: the QR tile, the network banner and the primary buttons.');
    await keyboardFocus('[data-testid="saveQR"] button');
    await capture('07-receive-button-keyboard-focus', 'Receive: the primary button focused from the keyboard.');

    await route('Settings');
    await waitFor('[data-testid="settings-fiat"]', 'Settings');
    await capture('08-settings', 'Settings: the content card.');

    await route('SettingsNetworksAssets');
    await waitFor('[data-testid="tabButton"]', 'Network management');
    await capture('09-network-tabs', 'Networks: the tab list, the search field and the network switches.');

    await route('SettingsChangePassword');
    await waitFor('.input .el-input__inner', 'Change password');
    await keyboardFocus('.input .el-input__inner');
    await capture('10-calm-change-password', 'Change password (Calm): labelled fields, the first focused from the keyboard.');

    await route('ResetWallet');
    await waitFor('.fw-calm', 'Reset wallet');
    await capture('11-calm-reset-wallet', 'Reset wallet (Calm): the explanation and the confirmation field; nothing is reset.');

    // Last, because a dialog that does not close stays over every later screen.
    await route('Settings');
    await waitFor('[data-testid="settings-fiat"]', 'Settings again');
    await click('[data-testid="settings-fiat"]');
    await waitFor('.select-popup .row', 'Currency list');
    await capture('12-currency-dialog', 'A dialog over its scrim: the currency list with its search field and the selected row.');
    const dialogOpen = 'Boolean(document.querySelector(\'.select-popup .row\'))';
    const closes = async (close) => {
      await close();
      await sleep(600);
      return !(await evaluate(cdp, sessionId, dialogOpen));
    };
    const dialog = results.at(-1);
    dialog.closesWithItsButton = await closes(() => click('.select-popup [data-testid="basicCloseBtn"]'));
    if (dialog.closesWithItsButton) {
      await click('[data-testid="settings-fiat"]');
      await waitFor('.select-popup .row', 'Currency list again');
      dialog.closesWithEscape = await closes(async () => {
        for (const type of ['keyDown', 'keyUp']) {
          await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
        }
      });
    }

    await fs.writeFile(
      path.join(outputDir, 'README.md'),
      `# Primitives at the popup size (${POPUP_WIDTH} x ${POPUP_HEIGHT}, device scale 2)\n\n` +
        'Captured offline by `node scripts/solana-extension-smoke.mjs --primitives-screenshots <dir>` from the test build. ' +
        'Nothing is submitted. `results.json` records, per screen, how the primitives on it are painted and named.\n\n' +
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
