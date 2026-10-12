import process from 'node:process';
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
import { captureAuthorizationScreenshots } from './extension-smoke-authorization.mjs';
import { captureMetadataScreenshots } from './extension-smoke-metadata.mjs';
import { captureSigningScreenshots } from './extension-smoke-signing.mjs';
import { captureWalletConnectOwnership } from './extension-smoke-wallet-connect.mjs';

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
    searchFields: [...document.querySelectorAll('.search-input-wrapper')].filter(visible).map((wrapper) => {
      const field = wrapper.querySelector('input');
      const label = field?.labels?.[0];
      const icon = wrapper.querySelector('.search-icon');
      const fieldBox = field.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const iconBox = icon?.getBoundingClientRect();
      const clear = wrapper.querySelector('[data-testid="clearSearch"]');
      const clearBox = clear?.getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        iconWithinField: !iconBox || iconBox.left >= fieldBox.left && iconBox.right <= fieldBox.right && iconBox.top >= fieldBox.top && iconBox.bottom <= fieldBox.bottom,
        iconCenterOffset: iconBox ? Math.round(Math.abs(iconBox.top + iconBox.height / 2 - fieldBox.top - fieldBox.height / 2)) : 0,
        fieldBox: fieldBox.toJSON(),
        clearBox: clearBox?.toJSON() ?? null,
        resultStatus: wrapper.querySelector('[data-testid="searchResultStatus"]')?.textContent.trim() ?? null,
        clearName: clear?.getAttribute('aria-label') ?? null,
        clearWithinField: !clearBox || clearBox.left >= fieldBox.left && clearBox.right <= fieldBox.right && clearBox.top >= fieldBox.top && clearBox.bottom <= fieldBox.bottom,
        clearTargetSize: !clearBox || clearBox.width >= 48 && clearBox.height >= 48,
        textAvoidsClear: !clearBox || parseFloat(getComputedStyle(field).paddingRight) >= fieldBox.right - clearBox.left,
        labelOverlapsButton: [...(wrapper.closest('[role="dialog"]') ?? document).querySelectorAll('button')].filter(visible).some((button) => overlaps(labelBox, button.getBoundingClientRect())),
      };
    }),
    focused: focused && {
      tag: focused.tagName.toLowerCase(),
      testid: focused.closest('[data-testid]')?.dataset.testid ?? null,
      focusVisible: focused.matches(':focus-visible'),
      ...pick(focused, ['outline-color', 'outline-style', 'outline-width', 'outline-offset', 'border-top']),
      wrapper: pick(focused.parentElement, ['filter']),
    },
    sheet: pick(first('.form-background:not(.form-contained) .form'), paint),
    sheetRole: document.querySelector('.form-background:not(.form-contained)')?.getAttribute('role') ?? null,
    sheetControlsUnobscured: dialog ? undefined : [...document.querySelectorAll('.form-background:not(.form-contained) .header-content button')]
      .filter(visible).every((button) => {
        const box = button.getBoundingClientRect();
        // Short viewports scroll the complete sheet, including its header. Offscreen
        // controls are checked when scrolled into view; visible controls must remain hit-testable.
        if (box.bottom <= 0 || box.top >= innerHeight) return true;
        const x = box.x + box.width / 2, y = Math.max(0, box.top) + (Math.min(innerHeight, box.bottom) - Math.max(0, box.top)) / 2;
        return button.contains(document.elementFromPoint(x, y));
      }),
    dialog: dialog && { ...pick(dialog, paint), role: dialog.closest('[role]')?.getAttribute('role') ?? null },
    dialogControlsUnobscured: dialog && [...dialog.querySelectorAll('button')].filter(visible).every((button) => {
      const box = button.getBoundingClientRect();
      const clip = dialog.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (y < clip.top || y > clip.bottom || y < 0 || y > innerHeight) return true;
      return button.contains(document.elementFromPoint(x, y));
    }),
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
  // This tab alone can substitute the migration inventory response with a public UI fixture.
  // Every other message uses the real isolated test worker unchanged.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const wcOwnershipOnly = ${process.env.WC_OWNERSHIP_ONLY === 'true'};
    const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = originalConnect(...args);
      const post = port.postMessage.bind(port);
      const add = port.onMessage.addListener.bind(port.onMessage);
      const listeners = new Set();
      port.onMessage.addListener = (listener) => { listeners.add(listener); add(listener); };
      port.postMessage = (message) => {
        if (wcOwnershipOnly && message.message === 'pri(walletConnect.signing.requests.subscribe)') {
          // This fixture owns its queue. A late worker bootstrap snapshot must not
          // erase the public requests after the harness places them on screen.
          queueMicrotask(() => { for (const listener of listeners) listener({ id: message.id, response: [] }); });
        } else if (message.message === 'pri(keyring.getUniversalWalletMigrationSnapshot)' && window.__migrationFixtureReply) {
          const reply = { id: message.id, ...window.__migrationFixtureReply };
          queueMicrotask(() => { for (const listener of listeners) listener(reply); });
        } else if (message.message === 'pri(keyring.getMigrationAccounts)' && window.__legacyRowsFixtureReply) {
          const reply = { id: message.id, ...window.__legacyRowsFixtureReply };
          queueMicrotask(() => { for (const listener of listeners) listener(reply); });
        } else if (message.message === 'pri(keyring.migrateMasterPassword)' && window.__legacyRowsFixtureReply) {
          window.__legacyMigrationRequests = (window.__legacyMigrationRequests || 0) + 1;
          window.__finishLegacyMigration = (response) => {
            for (const listener of listeners) listener({ id: message.id, response });
          };
        } else if (window.__authorizationFixture && ['pri(authorize.approve)', 'pri(authorize.delete.request)'].includes(message.message)) {
          window.__authorizationFixture.requests.push({ message: message.message, request: message.request });
          window.__finishAuthorization = (reply) => {
            for (const listener of listeners) listener({ id: message.id, ...reply });
          };
        } else if (window.__metadataFixture && ['pri(metadata.approve)', 'pri(metadata.reject)'].includes(message.message)) {
          window.__metadataFixture.requests.push({ message: message.message, request: message.request });
          window.__finishMetadata = (reply) => {
            for (const listener of listeners) listener({ id: message.id, ...reply });
          };
        } else if (window.__signingFixture && ['pri(signing.approve)', 'pri(signing.cancel)'].includes(message.message)) {
          window.__signingFixture.requests.push({ message: message.message, request: message.request });
          window.__finishSigning = (reply) => {
            for (const listener of listeners) listener({ id: message.id, ...reply });
          };
        } else if (window.__wcOwnershipFixture && ['pri(walletConnect.request.approve)', 'pri(walletConnect.request.reject)'].includes(message.message)) {
          window.__wcOwnershipFixture.requests.push({ message: message.message, request: message.request });
          window.__finishWcOwnership = (reply) => {
            for (const listener of listeners) listener({ id: message.id, ...reply });
          };
        } else if (window.__googleBackupFixture && message.message.startsWith('pri(google.')) {
          const send = (reply) => queueMicrotask(() => { for (const listener of listeners) listener({ id: message.id, ...reply }); });
          if (message.message === 'pri(google.verify.token)') send({ response: { expires_in: '3600' } });
          else if (message.message === 'pri(google.get.files)') send({ response: { files: [{ id: 'root-file', name: 'Public backup fixture.json', description: 'publicParent/linked-file' }] } });
          else if (message.message === 'pri(google.get.file)') {
            window.__googleBackupFixture.requests.push(message.request.id);
            if (message.request.id === 'root-file') send({ response: { address: 'publicParent' } });
            else window.__finishGoogleLinkedFile = send;
          } else send({ error: 'Unsupported public fixture action' });
        } else post(message);
      };
      return port;
    };
  })()` }, sessionId);
  const stopServing = await servePopupOffline(cdp, sessionId, { phishingDenyList: ['flagged.example.invalid'] });

  const route = (name) =>
    evaluate(cdp, sessionId, `${APP}.router.replace({ name: ${JSON.stringify(name)} }).then(() => true)`);
  const waitFor = (selector, label) =>
    waitForExpression(cdp, sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, label);
  const click = (selector) =>
    evaluate(
      cdp,
      sessionId,
      `(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => { const box = candidate.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
        if (!element) throw new Error('Not on screen: ' + ${JSON.stringify(selector)});
        element.scrollIntoView({ block: 'center' });
        element.click();
        return true;
      })()`
    );
  const escape = async () => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    }
  };
  const setSearch = async (query) => {
    await evaluate(cdp, sessionId, `(() => {
      const input = [...document.querySelectorAll('.search-input-wrapper input')].find((candidate) => { const box = candidate.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
      if (!input) throw new Error('Search field is missing');
      input.focus();
      input.select();
      return true;
    })()`);
    await cdp.send('Input.insertText', { text: query }, sessionId);
    await waitFor('[data-testid="clearSearch"]', 'Search clear control');
  };
  const assertSearchCleared = async () => {
    await waitForExpression(cdp, sessionId, `(() => {
      const input = [...document.querySelectorAll('.search-input-wrapper input')].find((candidate) => { const box = candidate.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
      return input && input.value === '' && document.activeElement === input && !input.closest('.search-input-wrapper').querySelector('[data-testid="clearSearch"]');
    })()`, 'Cleared search retains focus');
  };
  // A real key press first, so the focus that follows is keyboard focus (:focus-visible), as a Tab user gets it.
  const keyboardFocus = async (selector) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send(
        'Input.dispatchKeyEvent',
        { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
        sessionId
      );
    }
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => { const box = candidate.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
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
    await evaluate(cdp, sessionId, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    // Recorded rather than fatal, so a build that overflows can still be compared with one that does not.
    const pageWidth = await evaluate(cdp, sessionId, 'document.documentElement.scrollWidth');
    const viewportWidth = await evaluate(cdp, sessionId, 'window.innerWidth');
    const primitives = { ...(await evaluate(cdp, sessionId, PRIMITIVES)), pageWidth, viewportWidth };
    if (pageWidth > viewportWidth)
      console.info(`[extension-smoke] ${name}: the page is ${pageWidth}px wide in the ${viewportWidth}px popup`);
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

    if (process.env.WC_OWNERSHIP_ONLY === 'true') {
      await captureWalletConnectOwnership({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results });
      await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify({ scope: 'WalletConnect request ownership only', results }, null, 2) + '\n');
      return { shots, results };
    }
    if (process.env.SIGNING_REVIEW_ONLY === 'true') {
      await captureSigningScreenshots({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results });
      await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify({ scope: 'signing review only', results }, null, 2) + '\n');
      return { shots, results };
    }

    await route('Currencies');
    await waitFor('[data-testid="portfolioTokenList"]', 'By token list');
    if (await evaluate(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="layoutNoteDismiss"]\'))')) {
      await click('[data-testid="layoutNoteDismiss"]');
    }
    await capture(
      '01-portfolio-controls',
      'Portfolio: tab buttons, search field, icon button, lens segments and the Hide zero switch.'
    );

    await click('[data-testid="filterBtn"] button');
    await waitFor('[data-testid="tokenRowSwitch"]', 'Manage in By token');
    await capture('02-manage-switches', 'Manage: one switch per token and per network, the filter chips.');
    await click('[data-testid="filterBtn"] button');
    await waitForExpression(
      cdp,
      sessionId,
      '!document.querySelector(\'[data-testid="tokenRowSwitch"]\')',
      'Manage closed'
    );

    await openGroupAction('usdt', 'groupSend');
    await click('[data-testid="groupNetworkOption"][data-network="Ethereum"]');
    await waitFor('[data-testid="amountInternal"]', 'Send on Ethereum');
    await capture(
      '03-send-form',
      'Send (a sheet): the amount input, the recipient field, the banner and the disabled primary button.'
    );

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
    await setSearch('Polkadot');
    await keyboardFocus('[data-testid="clearSearch"]');
    await capture('09b-network-search-clear', 'Networks: a named clear control with visible keyboard focus.');
    await click('[data-testid="clearSearch"]');
    await assertSearchCleared();
    results.at(-1).clearRestoresInputFocus = true;

    await route('SettingsChangePassword');
    await waitFor('.input .el-input__inner', 'Change password');
    await keyboardFocus('.input .el-input__inner');
    await capture(
      '10-calm-change-password',
      'Change password (Calm): labelled fields, the first focused from the keyboard.'
    );

    await route('ResetWallet');
    await waitFor('.fw-calm', 'Reset wallet');
    await capture(
      '11-calm-reset-wallet',
      'Reset wallet (Calm): the explanation and the confirmation field; nothing is reset.'
    );

    // Last, because a dialog that does not close stays over every later screen.
    await route('Settings');
    await waitFor('[data-testid="settings-fiat"]', 'Settings again');
    await click('[data-testid="settings-fiat"]');
    await waitFor('.select-popup .row', 'Currency list');
    await capture(
      '12-currency-dialog',
      'A dialog over its scrim: the currency list with its search field and the selected row.'
    );
    await setSearch('Dollar');
    await keyboardFocus('[data-testid="clearSearch"]');
    await capture('12b-currency-search-clear', 'Currency search: a named clear control; Escape first clears the query.');
    const currencyCountAnnounced = await evaluate(cdp, sessionId, `(() => {
      const dialog = document.querySelector('.select-popup');
      return dialog.querySelector('[data-testid="searchResultStatus"]').textContent.trim().endsWith(': ' + dialog.querySelectorAll('.row').length);
    })()`);
    if (!currencyCountAnnounced) throw new Error('Currency result count does not match the filtered rows');
    results.at(-1).currencyCountAnnounced = true;
    await keyboardFocus('.search-input-wrapper input');
    await escape();
    await assertSearchCleared();
    if (!(await evaluate(cdp, sessionId, "Boolean(document.querySelector('.select-popup .row'))"))) {
      throw new Error('Escape closed the currency dialog before clearing its search');
    }
    results.at(-1).escapeClearsBeforeDismissal = true;
    const dialogOpen = "Boolean(document.querySelector('.select-popup .row'))";
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
      dialog.closesWithEscape = await closes(escape);
    }

    if (!dialog.closesWithItsButton || !dialog.closesWithEscape) throw new Error('Currency dialog dismissal regressed');
    // Exercise the real appearance setting and OS media hooks. A 281 x 300 CSS viewport represents the 561 x 600
    // popup at 200% page zoom, and catches controls that only fit the normal popup dimensions.
    const variants = [
      { name: '13-dialog-lite', preference: 'lite' },
      { name: '14-dialog-reduced', preference: 'reduced' },
      { name: '15-dialog-high-contrast', media: [{ name: 'prefers-contrast', value: 'more' }] },
      { name: '16-dialog-reduced-motion', media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      { name: '17-dialog-forced-colors', media: [{ name: 'forced-colors', value: 'active' }] },
      { name: '18-dialog-narrow', width: 320, height: 600 },
      { name: '19-dialog-200-percent', width: 281, height: 300 },
      { name: '20-dialog-russian-search', width: 320, height: 600, locale: 'ru-RU' },
      { name: '21-dialog-akkadian-search', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
      { name: '22-dialog-egyptian-search', width: 320, height: 600, locale: 'egy-Egyp' },
    ];
    for (const variant of variants) {
      await cdp.send('Emulation.setEmulatedMedia', { features: variant.media ?? [] }, sessionId);
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        {
          width: variant.width ?? POPUP_WIDTH,
          height: variant.height ?? POPUP_HEIGHT,
          deviceScaleFactor: 2,
          mobile: false,
        },
        sessionId
      );
      if (variant.locale) {
        await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(variant.locale)}, document.documentElement.lang = ${JSON.stringify(variant.locale)}, true)`);
      }
      await route('Settings');
      await waitFor('[data-testid="visualEffects-auto"] input', 'Visual effects choice');
      await click(`[data-testid="visualEffects-${variant.preference ?? 'auto'}"] input`);
      await click('[data-testid="settings-fiat"]');
      await waitFor('.select-popup .row', 'Currency dialog variant');
      await setSearch('Dollar');
      await keyboardFocus('[data-testid="clearSearch"]');
      await capture(variant.name, 'Currency dialog: ' + variant.name.replace('dialog-', '').replaceAll('-', ' '));
      results.at(-1).dialogWithinViewport = await evaluate(
        cdp,
        sessionId,
        `(() => {
        const box = document.querySelector('.popup-container').getBoundingClientRect();
        return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
      })()`
      );
      await click('[data-testid="clearSearch"]');
      await assertSearchCleared();
      results.at(-1).clearRestoresInputFocus = true;
      await click('.select-popup [data-testid="basicCloseBtn"]');
      await waitForExpression(cdp, sessionId, '!' + dialogOpen, 'Currency dialog closed');
    }

    // Exercise the actual password form with public fixture credentials. No chain transaction is submitted.
    await extensionSend(cdp, controlSession, 'pri(keyring.lock)', true);
    await route('Unlock');
    await waitFor('.unlock input', 'Locked fixture password form');
    await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = 'en-US', true)`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: POPUP_WIDTH, height: POPUP_HEIGHT, deviceScaleFactor: 2, mobile: false }, sessionId);
    await keyboardFocus('.unlock input');
    await cdp.send('Input.insertText', { text: 'public-fixture-wrong-password' }, sessionId);
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    }
    await waitForExpression(cdp, sessionId, `document.querySelector('.unlock input')?.getAttribute('aria-invalid') === 'true' && !document.querySelector('.unlock-btn button')?.disabled`, 'Wrong password permits retry');
    const unlockVariants = [
      { name: '23-unlock-retry', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
      { name: '24-unlock-russian', width: 320, height: 600, locale: 'ru-RU' },
      { name: '25-unlock-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
      { name: '26-unlock-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
      { name: '27-unlock-200-percent', width: 281, height: 300, locale: 'en-US' },
    ];
    for (const variant of unlockVariants) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: variant.width, height: variant.height, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(variant.locale)}, document.documentElement.lang = ${JSON.stringify(variant.locale)}, true)`);
      await keyboardFocus('[data-testid="forgotPassword"]');
      await capture(variant.name, 'Unlock: wrong-password retry and keyboard recovery controls, ' + variant.locale);
      const controls = await evaluate(cdp, sessionId, `(() => {
        const input = document.querySelector('.unlock input');
        const error = document.getElementById(input.getAttribute('aria-describedby'));
        return {
          errorAssociated: Boolean(error?.textContent.trim()) && error.getAttribute('role') === 'alert',
          recoveryControls: ['forgotPassword', 'unlockSupport'].map((id) => {
            const el = document.querySelector('[data-testid="' + id + '"]'); const box = el.getBoundingClientRect();
            return { tag: el.tagName, height: box.height, width: box.width, name: el.textContent.trim() };
          }),
        };
      })()`);
      if (!controls.errorAssociated || controls.recoveryControls.some((control) => control.height < 48 || !control.name) || controls.recoveryControls[0].tag !== 'BUTTON' || controls.recoveryControls[1].tag !== 'A') throw new Error('Unlock recovery semantics or targets regressed');
      Object.assign(results.at(-1), controls);
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await waitFor('[role="dialog"]', 'Keyboard-opened recovery dialog');
    results.at(-1).keyboardOpensRecovery = true;
    await escape();
    await waitForExpression(cdp, sessionId, `!document.querySelector('[role="dialog"]')`, 'Recovery dialog dismissed');
    await keyboardFocus('.unlock input');
    await evaluate(cdp, sessionId, `(document.querySelector('.unlock input').select(), true)`);
    await cdp.send('Input.insertText', { text: password }, sessionId);
    await click('.unlock-btn button');
    await waitForExpression(cdp, sessionId, `${APP}.router.currentRoute.value.name !== 'Unlock'`, 'Successful password retry leaves unlock');
    results.at(-1).successfulFixtureRetry = true;

    // Render the production migration component with a public, unavailable legacy descriptor.
    // A separate fixture route avoids changing the returning wallet's real migration/account state.
    await evaluate(cdp, sessionId, `(() => {
      const router = ${APP}.router;
      const original = router.getRoutes().find((record) => record.name === 'UniversalWalletMigration');
      router.addRoute({ path: '/design-migration-fixture', name: 'DesignMigrationFixture', component: original.components.default, meta: original.meta });
      return true;
    })()`);
    await evaluate(cdp, sessionId, `(() => {
      window.__migrationFixtureReply = { response: { schemaVersion: 1, platform: 'web', hasUniversalWallet: false, cutoffAtMillis: 1710000000000, evaluatedAtMillis: Date.now(), legacyVaults: [{ vaultId: 'public-unavailable-fixture', displayName: 'Retained wallet', address: 'public-fixture-address', ecosystem: 'substrate', mode: 'export-only', canExportSecrets: false, canSignTransactions: false }] } };
      return true;
    })()`);
    await route('DesignMigrationFixture');
    await waitFor('.universal-migration__vault-export button', 'Public migration inventory rendered');
    const migrationVariants = [
      { name: '30-migration-unavailable-export', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
      { name: '31-migration-russian', width: 320, height: 600, locale: 'ru-RU' },
      { name: '32-migration-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
      { name: '33-migration-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
      { name: '34-migration-compact', width: 281, height: 300, locale: 'en-US' },
    ];
    for (const variant of migrationVariants) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: variant.width, height: variant.height, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(variant.locale)}, document.documentElement.lang = ${JSON.stringify(variant.locale)}, true)`);
      await keyboardFocus('.universal-migration__vault-export button');
      const semantics = await evaluate(cdp, sessionId, `(() => {
        const button = document.querySelector('.universal-migration__vault-export button');
        const reason = document.getElementById(button.getAttribute('aria-describedby'));
        const label = button.querySelector('span');
        const expected = document.createElement('span'); expected.style.color = 'var(--fw-text-3)'; button.appendChild(expected);
        const disabledColorMatches = getComputedStyle(expected).color === getComputedStyle(button).color; expected.remove();
        return { focused: document.activeElement === button, disabled: button.disabled, ariaDisabled: button.getAttribute('aria-disabled'), reason: reason?.textContent.trim(), height: button.getBoundingClientRect().height, labelFits: label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().width <= button.clientWidth, disabledColorMatches };
      })()`);
      if (!semantics.focused || semantics.disabled || semantics.ariaDisabled !== 'true' || !semantics.reason || semantics.height < 44 || !semantics.labelFits || !semantics.disabledColorMatches) throw new Error('Unavailable export lost its keyboard explanation');
      await evaluate(cdp, sessionId, `(() => {
        const button = document.querySelector('.universal-migration__vault-export button');
        button.dataset.keyboardClicks = '0';
        button.addEventListener('click', () => { button.dataset.keyboardClicks = '1'; }, { once: true });
        return true;
      })()`);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }, sessionId);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
      const activated = await evaluate(cdp, sessionId, `document.querySelector('.universal-migration__vault-export button').dataset.keyboardClicks === '1'`);
      if (!activated) throw new Error('Keyboard did not activate the guarded export control');
      semantics.keyboardActivationGuarded = true;
      if (await evaluate(cdp, sessionId, `${APP}.router.currentRoute.value.name !== 'DesignMigrationFixture'`)) throw new Error('Unavailable export navigated');
      await capture(variant.name, 'Migration public fixture: unavailable export is focusable, explained and guarded, ' + variant.locale);
      Object.assign(results.at(-1), { migrationExport: semantics });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 2, mobile: false }, sessionId);
    await route('Currencies');
    await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = 'en-US', document.documentElement.lang = 'en-US', window.__migrationFixtureReply = { error: 'public fixture inventory failure' }, true)`);
    await route('DesignMigrationFixture');
    await waitFor('[data-testid="migrationLoadFailed"] button', 'Migration failure feedback');
    await keyboardFocus('[data-testid="migrationLoadFailed"] button');
    await capture('35-migration-load-failure', 'Migration snapshot failure offers a retry without presenting an empty wallet.');
    await route('Currencies');

    await evaluate(cdp, sessionId, `(() => {
      const router = ${APP}.router;
      const original = router.getRoutes().find((record) => record.name === 'MigrationDescription');
      router.addRoute({ path: '/design-password-migration-fixture', name: 'DesignPasswordMigrationFixture', component: original.components.default, meta: original.meta });
      return true;
    })()`);
    await route('DesignPasswordMigrationFixture');
    await waitFor('[data-testid="migrationLater"] button', 'Known-master-password migration prompt');
    const passwordMigrationVariants = [
      { name: '36-password-migration', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
      { name: '37-password-migration-russian', width: 320, height: 600, locale: 'ru-RU' },
      { name: '38-password-migration-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
      { name: '39-password-migration-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
      { name: '40-password-migration-compact', width: 281, height: 300, locale: 'en-US' },
    ];
    for (const variant of passwordMigrationVariants) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: variant.width, height: variant.height, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(variant.locale)}, document.documentElement.lang = ${JSON.stringify(variant.locale)}, true)`);
      await keyboardFocus('[data-testid="migrationStart"] button');
      const controls = await evaluate(cdp, sessionId, `['migrationStart', 'migrationLater'].map((id) => {
        const button = document.querySelector('[data-testid="' + id + '"] button');
        const label = button.querySelector('span');
        return { id, enabled: !button.disabled, height: button.getBoundingClientRect().height, labelFits: label.scrollWidth <= label.clientWidth + 1 };
      })`);
      if (controls.some((button) => !button.enabled || button.height < 48 || !button.labelFits)) throw new Error('Password migration action is clipped or unavailable after loading');
      await capture(variant.name, 'Known-master-password public fixture: migration Start and Later remain readable and keyboard reachable, ' + variant.locale);
      Object.assign(results.at(-1), { passwordMigrationControls: controls });
    }
    await route('Currencies');

    await evaluate(cdp, sessionId, `(() => {
      const router = ${APP}.router;
      const original = router.getRoutes().find((record) => record.name === 'MigrationAccounts');
      router.addRoute({ path: '/design-migration-rows-fixture', name: 'DesignMigrationRowsFixture', component: original.components.default, meta: original.meta });
      window.__legacyRowsFixtureReply = { response: [{ address: '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH', name: 'Public legacy savings account', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false }] };
      return true;
    })()`);
    await route('DesignMigrationRowsFixture');
    await waitFor('.wallet__checkbox input', 'Public legacy password row');
    await keyboardFocus('.wallet__checkbox input');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ' }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' }, sessionId);
    await waitForExpression(cdp, sessionId, `document.querySelector('.json__controls')?.offsetHeight > 0`, 'Keyboard-expanded password row');
    const rowVariants = [
      { name: '41-migration-account-row', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
      { name: '42-migration-account-russian', width: 320, height: 600, locale: 'ru-RU' },
      { name: '43-migration-account-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
      { name: '44-migration-account-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
      { name: '45-migration-account-compact', width: 281, height: 300, locale: 'en-US' },
    ];
    for (const variant of rowVariants) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: variant.width, height: variant.height, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(variant.locale)}, document.documentElement.lang = ${JSON.stringify(variant.locale)}, true)`);
      await keyboardFocus('.button__confirm button');
      const controls = await evaluate(cdp, sessionId, `(() => {
        const button = document.querySelector('.button__confirm button');
        const label = button.querySelector('span');
        const reason = document.getElementById(button.getAttribute('aria-describedby'));
        return { focusable: !button.disabled, unavailable: button.getAttribute('aria-disabled') === 'true', reason: reason?.textContent.trim(), height: button.getBoundingClientRect().height, labelFits: label.scrollWidth <= label.clientWidth + 1, checkboxSelected: document.querySelector('.wallet__checkbox input').checked };
      })()`);
      if (!controls.focusable || !controls.unavailable || !controls.reason || controls.height < 48 || !controls.labelFits || !controls.checkboxSelected) throw new Error('Migration row lost keyboard state, disabled explanation or action geometry');
      await capture(variant.name, 'Public legacy account: native keyboard expansion and password-required explanation, ' + variant.locale);
      Object.assign(results.at(-1), { migrationRow: controls });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: POPUP_WIDTH, height: POPUP_HEIGHT, deviceScaleFactor: 2, mobile: false }, sessionId);
    await evaluate(cdp, sessionId, `(${APP}.app.config.globalProperties.$i18n.locale = 'en-US', document.documentElement.lang = 'en-US', true)`);
    await keyboardFocus('.input__validate-pass input');
    await cdp.send('Input.insertText', { text: 'public-fixture-password' }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r' }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }, sessionId);
    await waitForExpression(cdp, sessionId, `document.querySelector('.button__confirm button')?.getAttribute('aria-busy') === 'true'`, 'Migration pending state');
    const pendingRow = await evaluate(cdp, sessionId, `({ requests: window.__legacyMigrationRequests, name: document.querySelector('.button__confirm button').textContent.trim(), continueUnavailable: document.querySelector('[data-testid="migrationContinue"] button').getAttribute('aria-disabled'), skipUnavailable: document.querySelector('[data-testid="migrationSkip"] button').disabled, recoveryUnavailable: document.querySelector('[data-testid="usePhrase"]').disabled })`);
    if (pendingRow.requests !== 1 || !pendingRow.name || pendingRow.continueUnavailable !== 'true' || !pendingRow.skipUnavailable || !pendingRow.recoveryUnavailable) throw new Error('Migration pending state permits competing navigation');
    const pendingPaint = await evaluate(cdp, sessionId, `(() => {
      const button = document.querySelector('.button__confirm button');
      const style = getComputedStyle(button);
      const ring = button.querySelector('.button-progress');
      const ringStyle = ring && getComputedStyle(ring);
      return { color: style.color, background: style.backgroundImage, mask: getComputedStyle(button, '::before').display, ringSize: ring?.getBoundingClientRect().width, ringColor: ringStyle?.borderTopColor, ringHidden: ring?.getAttribute('aria-hidden'), live: button.parentElement.getAttribute('aria-live'), calm: !!button.closest('.fw-calm'), shadow: style.boxShadow, duplicateStatus: document.querySelector('.wallets__item .row-status') !== null };
    })()`);
    if (pendingPaint.color !== 'rgb(255, 255, 255)' || !pendingPaint.background.includes('rgb(214, 0, 127)') || pendingPaint.mask !== 'none' || pendingPaint.ringSize < 20 || pendingPaint.ringColor !== pendingPaint.color || pendingPaint.ringHidden !== 'true' || pendingPaint.live !== 'polite' || !pendingPaint.calm || pendingPaint.shadow !== 'none' || pendingPaint.duplicateStatus) throw new Error('Pending action lost readable fill, progress ring or concise live status: ' + JSON.stringify(pendingPaint));
    await capture('46-migration-account-pending', 'Public fixture request held at popup boundary; named pending state and competing navigation disabled.');
    Object.assign(results.at(-1), { pendingRow, pendingPaint });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }] }, sessionId);
    await waitForExpression(cdp, sessionId, `document.documentElement.dataset.fwEffects === 'reduced'`, 'Reduced transparency pending state');
    const reducedPending = await evaluate(cdp, sessionId, `(() => {
      const button = document.querySelector('.button__confirm button');
      const ringStyle = getComputedStyle(button.querySelector('.button-progress'));
      return { shadow: getComputedStyle(button).boxShadow, iterations: ringStyle.animationIterationCount, duration: ringStyle.animationDuration };
    })()`);
    if (reducedPending.shadow !== 'none' || reducedPending.iterations !== '1' || parseFloat(reducedPending.duration) > 0.01) throw new Error('Reduced motion pending state still glows or loops');
    await capture('46b-migration-account-reduced-motion', 'Public fixture with reduced transparency and motion: pending state remains readable without glow or looping motion.');
    Object.assign(results.at(-1), { reducedPending });
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
    await evaluate(cdp, sessionId, `(window.__finishLegacyMigration(false), true)`);
    await waitForExpression(cdp, sessionId, `document.querySelector('.error-descriptions')?.textContent.trim().length > 0`, 'Migration password error');
    await capture('47-migration-account-password-retry', 'Incorrect fixture password retains input and releases the request for retry.');
    await click('[data-testid="migrationSkip"] button');
    await waitFor('[data-testid="notificationText"]', 'Migration skip confirmation');
    await capture('48-migration-skip-confirmation', 'Skip confirmation keeps accounts and separates the Cancel action.');
    await click('[data-testid="closeBtn"] button');
    await click('.button__confirm button');
    await waitForExpression(cdp, sessionId, `window.__legacyMigrationRequests === 2`, 'Second fixture migration request');
    await evaluate(cdp, sessionId, `(window.__legacyRowsFixtureReply = { response: [] }, window.__finishLegacyMigration(true), true)`);
    await waitForExpression(cdp, sessionId, `document.querySelector('[data-testid="migrationContinue"] button')?.getAttribute('aria-disabled') !== 'true'`, 'Completed fixture row');
    await keyboardFocus('[data-testid="migrationContinue"] button');
    await capture('49-migration-account-completed', 'Public fixture completion releases Continue only after account state succeeds.');
    await route('Currencies');

    await evaluate(cdp, sessionId, `(() => {
      const router = ${APP}.router;
      const original = router.getRoutes().find((record) => record.name === 'AddFromGoogle');
      router.addRoute({ path: '/design-google-backup-fixture/:access_token', name: 'DesignGoogleBackupFixture', component: original.components.default, meta: original.meta });
      window.__googleBackupFixture = { requests: [] };
      return true;
    })()`);
    await evaluate(cdp, sessionId, `${APP}.router.replace({ name: 'DesignGoogleBackupFixture', params: { access_token: 'public-fixture-only' } }).then(() => true)`);
    await waitFor('.wallet__checkbox input', 'Public paired Google backup fixture');
    await keyboardFocus('.wallet__checkbox input');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ' }, sessionId);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' }, sessionId);
    await waitForExpression(cdp, sessionId, `window.__googleBackupFixture.requests.length === 2`, 'Both declared backup downloads');
    await keyboardFocus('.input__validate-pass input');
    await cdp.send('Input.insertText', { text: 'public-fixture-password' }, sessionId);
    const missingBackup = await evaluate(cdp, sessionId, `(() => {
      const button = document.querySelector('.button__confirm button');
      return { requests: window.__googleBackupFixture.requests, unavailable: button.getAttribute('aria-disabled'), reason: document.getElementById(button.getAttribute('aria-describedby'))?.textContent.trim(), retryDisabled: document.querySelector('.backup-loading button').disabled };
    })()`);
    if (missingBackup.unavailable !== 'true' || !missingBackup.reason || !missingBackup.retryDisabled) throw new Error('Google import enabled before its declared linked file arrived');
    await capture('50-google-backup-linked-pending', 'Public fixture: linked backup held at popup boundary; parent alone cannot enable import.');
    Object.assign(results.at(-1), { missingBackup });
    await evaluate(cdp, sessionId, `(window.__finishGoogleLinkedFile({ error: 'public fixture download failure' }), true)`);
    await waitForExpression(cdp, sessionId, `document.querySelector('.button__confirm .button-disabled-reason')?.textContent.trim() && !document.querySelector('.backup-loading button').disabled`, 'Retryable linked backup failure');
    await keyboardFocus('.backup-loading button');
    await capture('51-google-backup-linked-retry', 'Public fixture: linked download failure retains the loaded parent and offers retry.');
    await click('.backup-loading button');
    await waitForExpression(cdp, sessionId, `window.__googleBackupFixture.requests.length === 3`, 'Linked-only backup retry');
    const requestedFiles = await evaluate(cdp, sessionId, `window.__googleBackupFixture.requests`);
    if (requestedFiles.join(',') !== 'root-file,linked-file,linked-file') throw new Error('Retry downloaded unrelated backup files');
    await evaluate(cdp, sessionId, `(window.__finishGoogleLinkedFile({ response: { address: '0xPublicLinkedFixture' } }), true)`);
    await waitForExpression(cdp, sessionId, `document.querySelector('.button__confirm button')?.getAttribute('aria-disabled') !== 'true'`, 'Both public backup files available');
    await keyboardFocus('.button__confirm button');
    await capture('52-google-backup-files-ready', 'Public fixture files loaded; import becomes available. No restore or account mutation is submitted.');
    await route('Currencies');

    await captureAuthorizationScreenshots({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results });
    await captureMetadataScreenshots({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results });
    await captureSigningScreenshots({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results });

    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: 32,
        height: 32,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId
    );
    const bootstrapWidth = await evaluate(cdp, sessionId, 'getComputedStyle(document.documentElement).minWidth');
    if (bootstrapWidth !== '561px') throw new Error('Toolbar popup lost its initial intrinsic width');
    results.push({ name: 'toolbar-bootstrap', minWidth: bootstrapWidth });

    await fs.writeFile(
      path.join(outputDir, 'README.md'),
      `# Primitives at the popup size (${POPUP_WIDTH} x ${POPUP_HEIGHT}, device scale 2)\n\n` +
        'Captured offline by `node scripts/solana-extension-smoke.mjs --primitives-screenshots <dir>` from the test build. ' +
        'Only public fixture unlock credentials are submitted; no chain transactions. `results.json` records, per screen, how the primitives on it are painted and named.\n\n' +
        shots.map(({ file, description }) => `- \`${path.basename(file)}\`: ${description}`).join('\n') +
        '\n'
    );
    await fs.writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

    const layoutFailures = results.filter((result) =>
      result.pageWidth > result.viewportWidth ||
      result.dialogWithinViewport === false ||
      result.sheetControlsUnobscured === false ||
      result.dialogControlsUnobscured === false ||
      result.searchFields?.some((field) => !field.iconWithinField || field.iconCenterOffset > 2 || field.labelOverlapsButton || !field.clearWithinField || !field.clearTargetSize || !field.textAvoidsClear)
    );
    if (layoutFailures.length) {
      throw new Error('Primitive layout checks failed: ' + layoutFailures.map(({ name }) => name).join(', '));
    }

    return { shots, results };
  } catch (error) {
    const where = await evaluate(
      cdp,
      sessionId,
      '({ route: location.hash, text: document.body?.innerText.slice(0, 600) ?? "", search: [...document.querySelectorAll(".search-input-wrapper input")].map((input) => ({value: input.value, label: input.labels?.[0]?.textContent, display: getComputedStyle(input).display, width: input.getBoundingClientRect().width, html: input.closest(".search-input-wrapper").outerHTML.slice(0, 3000)})) })'
    ).catch(() => ({}));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId).catch(() => ({}));

    await fs.mkdir(outputDir, { recursive: true });
    if (data) await fs.writeFile(path.join(outputDir, 'failure.png'), Buffer.from(data, 'base64'));
    await fs.writeFile(path.join(outputDir, 'failure-context.json'), JSON.stringify(where, null, 2));
    error.message = `${error.message}\nPopup at ${where.route}: ${JSON.stringify(where.text)}`;
    throw error;
  } finally {
    stopServing();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
  }
}
