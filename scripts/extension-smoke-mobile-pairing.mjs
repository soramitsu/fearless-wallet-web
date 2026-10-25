import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// Public display fixtures intercepted before the worker. No actual pairing URI,
// relay connection, external wallet or account import is used by this capture.
export async function captureMobilePairingScreenshots({ cdp, sessionId, evaluate, waitForExpression, route, waitFor, click, keyboardFocus, capture, results }) {
  const run = (s) => evaluate(cdp, sessionId, s);
  const wait = (s, label) => waitForExpression(cdp, sessionId, s, label);
  const fixture = async (mode = 'ready') => {
    await route('Wallet');
    await run(`(window.__mobilePairingFixture = { mode: ${JSON.stringify(mode)}, requests: [] }, window.__finishMobilePairing = undefined, true)`);
    await route('MobileWalletAuth');
  };
  const resize = (width, height = POPUP_HEIGHT) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  for (const locale of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
    await run(`(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(locale)}, document.documentElement.lang = ${JSON.stringify(locale)}, true)`);
    await resize(locale === 'en-EN' ? POPUP_WIDTH : 320);
    await fixture();
    await waitFor('.qr-wrapper img', 'Public mobile QR');
    await wait('typeof window.__finishMobilePairing === "function"', 'Mobile subscription');
    await capture(`90-mobile-pairing-qr-${locale}`, 'Mobile pairing public QR and translated instruction, ' + locale);
    await run('(window.__finishMobilePairing({ status: false, message: "duplicate" }), true)');
    await waitFor('.connection__status-message', 'Duplicate feedback');
    await capture(`91-mobile-pairing-duplicate-${locale}`, 'Existing-wallet failure, ' + locale);
    await fixture();
    await wait('typeof window.__finishMobilePairing === "function"', 'Mobile subscription');
    await run('(window.__finishMobilePairing({ status: true }), true)');
    await waitFor('[data-testid="continueBtn"] button', 'Mobile pairing Continue');
    await keyboardFocus('[data-testid="continueBtn"] button');
    await capture(`92-mobile-pairing-complete-${locale}`, 'Pairing result and keyboard-focused Continue, ' + locale);
  }
  await resize(281, 300);
  await run(`(${APP}.app.config.globalProperties.$i18n.locale = 'en-EN', document.documentElement.lang = 'en-EN', document.documentElement.style.fontSize = '32px', true)`);
  await fixture(); await waitFor('.qr-wrapper img', 'Compact QR');
  await capture('93-mobile-pairing-compact', 'Mobile pairing at281×300 and200% root text');
  await run("(document.querySelector('.qr-wrapper').scrollIntoView({ block: 'center' }), true)");
  await capture('93b-mobile-pairing-compact-qr', 'Compact QR remains reachable by scrolling');
  await run('(window.__finishMobilePairing({ status: true }), true)');
  await waitFor('[data-testid="continueBtn"] button', 'Compact Continue');
  await keyboardFocus('[data-testid="continueBtn"] button');
  await capture('94-mobile-pairing-compact-complete', 'Compact result and Continue at200% root text');
  await resize(POPUP_WIDTH);
  await run("(document.documentElement.style.fontSize = '', true)");
  await fixture('pending');
  await waitFor('.loader', 'Pairing initialization loading');
  await capture('95-mobile-pairing-initializing', 'Pending pairing initialization retains Close');
  await route('Wallet');
  await run(`(window.__pairingCancelledRoute = ${APP}.router.currentRoute.value.fullPath, true)`);
  await wait("window.__mobilePairingFixture.requests.some(x => x.message === 'pri(walletConnect.app.cancelPairing)')", 'Cancelled on unmount');
  await run('(window.__finishMobileInit({ response: "wc:public-late-fixture" }), true)');
  const afterClose = await run(`({ stayedOnWallet: ${APP}.router.currentRoute.value.fullPath === window.__pairingCancelledRoute, subscribed: window.__mobilePairingFixture.requests.some(x => x.message === 'pri(walletConnect.app.subscribePairing)') })`);
  if (!afterClose.stayedOnWallet || afterClose.subscribed) throw new Error('Late pairing escaped cancellation: ' + JSON.stringify(afterClose));
  Object.assign(results.at(-1), { lateInitialization: afterClose });
  const failures = results.filter((r) => r.pageWidth > r.viewportWidth || r.sheetControlsUnobscured === false || r.dialogControlsUnobscured === false || r.dialogWithinViewport === false);
  if (failures.length) throw new Error('Mobile pairing layout failed: ' + failures.map((r) => r.name).join(', '));
}
