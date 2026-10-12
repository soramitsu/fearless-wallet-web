import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// Only public display fixtures are used. The popup's isolated port interceptor holds all responses;
// no approval is delivered to the background and no dApp or transaction is contacted.
export async function captureAuthorizationScreenshots({
  cdp,
  sessionId,
  evaluate,
  waitForExpression,
  route,
  waitFor,
  click,
  keyboardFocus,
  capture,
  results,
}) {
  const run = (source) => evaluate(cdp, sessionId, source);
  const wait = (source, label) => waitForExpression(cdp, sessionId, source, label);
  const approve = '[data-testid="approveAuthorization"] button';
  const reject = '[data-testid="rejectAuthorization"] button';
  const setLocale = (locale) =>
    run(
      `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(locale)}, document.documentElement.lang = ${JSON.stringify(locale)}, true)`
    );
  const resize = (width, height) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  const key = async (key, code, windowsVirtualKeyCode) => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        {
          type,
          key,
          code,
          windowsVirtualKeyCode,
          ...(type === 'keyDown' && key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
        },
        sessionId
      );
  };
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await setLocale('en-US');
  await run(`(() => {
    const store = ${APP}.pinia._s.get('extension');
    window.__authorizationFixture = { requests: [] };
    store.authRequests = [{ id: 'public-authorization-one', accountAuthType: 'evm', url: 'https://long-origin.public-fixture.example.invalid/application', request: { origin: 'Public application requesting account access', accountAuthType: 'evm' } }];
    return true;
  })()`);
  await route('Authorize');
  await waitFor(reject, 'Authorization Reject');
  await wait(
    `document.activeElement === document.querySelector(${JSON.stringify(reject)})`,
    'Authorization defaults keyboard focus to Reject'
  );
  const variants = [
    { name: '53-authorization-accounts', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
    { name: '54-authorization-russian', width: 320, height: 600, locale: 'ru-RU' },
    { name: '55-authorization-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
    { name: '56-authorization-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
    { name: '57-authorization-compact', width: 281, height: 300, locale: 'en-US' },
  ];
  for (const variant of variants) {
    await resize(variant.width, variant.height);
    await setLocale(variant.locale);
    await keyboardFocus(approve);
    await key('Enter', 'Enter', 13);
    const state = await run(`(() => {
      const button = document.querySelector(${JSON.stringify(approve)});
      const label = button.querySelector('span');
      const reason = document.getElementById(button.getAttribute('aria-describedby'));
      const expected = ${APP}.pinia._s.get('accounts').accounts.filter((account) => account.ethereumAddress).map((account) => account.ethereumAddress);
      const addresses = [...document.querySelectorAll('.account__address')].map((element) => element.textContent.trim());
      const bounds = button.getBoundingClientRect();
      const rejectBounds = document.querySelector(${JSON.stringify(reject)}).getBoundingClientRect();
      const heading = document.querySelector('.form-background [data-testid="header"]')?.textContent.trim();
      return { requests: window.__authorizationFixture.requests.length, unavailable: button.getAttribute('aria-disabled') === 'true', focusable: !button.disabled, reason: reason?.textContent.trim(), height: bounds.height, equalActions: Math.abs(bounds.width - rejectBounds.width) < 1 && Math.abs(bounds.height - rejectBounds.height) < 1, translatedHeading: !!heading && !heading.includes('.'), labelFits: label.scrollWidth <= label.clientWidth + 1, fullAddresses: JSON.stringify(expected) === JSON.stringify(addresses), noOverflow: document.documentElement.scrollWidth <= innerWidth, calm: !!document.querySelector('.fw-calm') };
    })()`);
    if (
      state.requests ||
      !state.unavailable ||
      !state.focusable ||
      !state.reason ||
      state.height < 48 ||
      !state.equalActions ||
      !state.translatedHeading ||
      !state.labelFits ||
      !state.fullAddresses ||
      !state.noOverflow ||
      !state.calm
    )
      throw new Error(
        'Authorization lost guarded activation, full addresses, Calm surface or control geometry: ' +
          JSON.stringify(state)
      );
    await capture(
      variant.name,
      'Public account-access request: full requester and account addresses, explicit Reject, keyboard-reachable unavailable approval; ' +
        variant.locale
    );
    Object.assign(results.at(-1), { authorization: state });
  }
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await setLocale('en-US');
  await keyboardFocus('.auth-account input');
  await key(' ', 'Space', 32);
  await wait(
    `document.querySelector(${JSON.stringify(approve)})?.getAttribute('aria-disabled') !== 'true'`,
    'Account selected'
  );
  await keyboardFocus(approve);
  await capture(
    '58-authorization-selected',
    'Public EVM account selected by native keyboard control; complete address remains visible.'
  );
  await key('Enter', 'Enter', 13);
  await wait(`window.__authorizationFixture.requests.length === 1`, 'Public approval captured at isolated popup port');
  const pending = await run(
    `({ rejectDisabled: document.querySelector(${JSON.stringify(reject)}).disabled, accountsDisabled: [...document.querySelectorAll('.auth-account input')].every((input) => input.disabled), selected: window.__authorizationFixture.requests[0].request.authorizedAccounts, expected: ${APP}.pinia._s.get('accounts').accounts.find((account) => account.ethereumAddress).address })`
  );
  if (
    !pending.rejectDisabled ||
    !pending.accountsDisabled ||
    JSON.stringify(pending.selected) !== JSON.stringify([pending.expected])
  )
    throw new Error('Authorization pending controls or exact account changed');
  await key('Enter', 'Enter', 13);
  if ((await run('window.__authorizationFixture.requests.length')) !== 1)
    throw new Error('Duplicate authorization submitted');
  await capture(
    '59-authorization-pending',
    'Only the selected public account is submitted; competing actions remain unavailable while the isolated response is held.'
  );
  Object.assign(results.at(-1), { authorizationPending: pending });
  await run(`(window.__finishAuthorization({ error: 'Public fixture worker unavailable' }), true)`);
  await wait(`!!document.querySelector('.authorize [role="alert"]')`, 'Authorization failure remains retryable');
  await capture(
    '60-authorization-retry',
    'Public fixture response failure retains the selected account and exposes a retryable error.'
  );
  await click(approve);
  await wait(`window.__authorizationFixture.requests.length === 2`, 'Second isolated approval');
  await run(`(() => {
    const store = ${APP}.pinia._s.get('extension');
    store.authRequests = [{ id: 'public-authorization-two', accountAuthType: 'evm', url: 'https://next.public-fixture.example.invalid', request: { origin: 'Next public application', accountAuthType: 'evm' } }];
    window.__finishAuthorization({ error: 'Previous request expired' });
    return true;
  })()`);
  await wait(
    `!document.querySelector('.authorize [role="alert"]') && !document.querySelector(${JSON.stringify(reject)})?.disabled`,
    'Old response cannot alter new request'
  );
  const replaced = await run(
    `({ selected: [...document.querySelectorAll('.auth-account input')].some((input) => input.checked), unavailable: document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled') === 'true', origin: document.querySelector('.authorize__content--link').textContent.trim() })`
  );
  if (replaced.selected || !replaced.unavailable || replaced.origin !== 'https://next.public-fixture.example.invalid')
    throw new Error('Selection leaked to the next requesting origin');
  await keyboardFocus(reject);
  await capture(
    '61-authorization-next-origin',
    'A new origin has no inherited selection or stale error from the previous request.'
  );
  Object.assign(results.at(-1), { authorizationReplacement: replaced });
  await click(reject);
  await wait(`window.__authorizationFixture.requests.length === 3`, 'Second request rejection captured');
  const rejection = await run(`window.__authorizationFixture.requests[2]`);
  if (rejection.message !== 'pri(authorize.delete.request)' || rejection.request !== 'public-authorization-two')
    throw new Error('Rejection changed request identity');
  await run(`(window.__finishAuthorization({ response: undefined }), true)`);
  await wait(`${APP}.router.currentRoute.value.name !== 'Authorize'`, 'Empty authorization queue leaves the screen');
  await route('Currencies');
}
