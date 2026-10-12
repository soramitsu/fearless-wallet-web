import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// All list/save/remove responses are intercepted at the popup port. No real dApp
// permission, external signer, network transaction or storage failure is used here.
export async function captureConnectionManagement({
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
  const run = (s) => evaluate(cdp, sessionId, s);
  const wait = (s, label) => waitForExpression(cdp, sessionId, s, label);
  const origin = 'https://complete-public-origin.connection-fixture.example.invalid';
  const resize = (width, height = POPUP_HEIGHT) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  const enter = async () => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        {
          type,
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}),
        },
        sessionId
      );
  };
  const setLocale = (locale) =>
    run(
      `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(locale)}, document.documentElement.lang = ${JSON.stringify(locale)}, true)`
    );
  const fixture = async (type = 'substrate', mode = '') => {
    await route('Wallet');
    await run(`(() => {
      const accounts = ${APP}.pinia._s.get('accounts').accounts;
      const origin = ${JSON.stringify(origin)};
      window.__connectionFixture = { requests: [], readError: ${mode === 'error'}, holdRead: ${mode === 'pending'}, list: {
        [origin]: { id: 'public-connection', url: origin, origin: 'Public display fixture', isAllowed: true, accountAuthType: 'both', authorizedAccounts: accounts.map(a => a.address), evmAuthorizedAccount: accounts.find(a => a.ethereumAddress)?.ethereumAddress, allowedAccountsMap: {} }
      }};
      window.__finishConnection = undefined;
      return true;
    })()`);
    await run(
      `${APP}.router.replace({ name: 'DAppsAuths', params: { type: ${JSON.stringify(type)} } }).then(() => true)`
    );
  };
  const writes = `window.__connectionFixture.requests.filter(r => r.message !== 'pri(authorize.list)')`;
  const inspect = async () =>
    run(`(() => {
    const controls = [...document.querySelectorAll('.auth-content button, .update-accounts .connect-button button, [data-testid="retryConnectionRead"] button')];
    return { origin: document.querySelector('.auth-item-name, .connection-origin')?.textContent.trim(), controls: controls.map(e => { const b=e.getBoundingClientRect(); return { width:b.width, height:b.height, disabled:e.disabled, label:(e.getAttribute('aria-label') || e.textContent).trim() }; }), noOverflow: document.documentElement.scrollWidth <= innerWidth };
  })()`);
  const shot = async (name, description) => {
    const state = await inspect();
    if (!state.noOverflow || state.controls.some((c) => c.height < 44 || !c.label))
      throw new Error('Connection control geometry: ' + JSON.stringify(state));
    await capture(name, description);
    Object.assign(results.at(-1), { connectionManagement: state });
  };

  for (const locale of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
    await resize(locale === 'en-EN' ? POPUP_WIDTH : 320);
    await setLocale(locale);
    await fixture();
    await waitFor('.auth-content .row-content', 'Public connection row');
    await keyboardFocus('.auth-content .row-content');
    await shot(
      `96-connections-list-${locale}`,
      'Complete public origin and labelled native details/removal buttons, ' + locale
    );
    await enter();
    await waitFor('.update-accounts .connect-button button', 'Connection account selection');
    await keyboardFocus('.connect-button button');
    const expected = await run(`window.__connectionFixture.list[${JSON.stringify(origin)}].authorizedAccounts`);
    await shot(
      `97-connections-details-${locale}`,
      'Complete origin, full public account addresses and current selections, ' + locale
    );
    await enter();
    await wait(`${writes}.length === 1`, 'One isolated account update');
    const pending = await run(
      `({ request: ${writes}[0], accountsDisabled: [...document.querySelectorAll('.auth-account input')].every(e => e.disabled), saveDisabled: document.querySelector('.connect-button button').disabled })`
    );
    if (
      !pending.accountsDisabled ||
      !pending.saveDisabled ||
      pending.request.message !== 'pri(authorize.update)' ||
      pending.request.request.url !== origin ||
      JSON.stringify(pending.request.request.authorizedAccounts) !== JSON.stringify(expected)
    )
      throw new Error('Incorrect pending account update: ' + JSON.stringify(pending));
    await enter();
    if (await run(`${writes}.length !== 1`)) throw new Error('Duplicate account update');
    if (locale === 'en-EN')
      await shot('98-connections-save-pending', 'Pending durable write disables selection and duplicate save');
    await run(`(window.__finishConnection({ error: 'Public fixture write failed' }), true)`);
    await waitFor('.update-accounts [role="alert"]', 'Save error');
    await shot(
      `99-connections-save-error-${locale}`,
      'Failed save retains selected accounts and offers translated retry, ' + locale
    );
    await click('.connect-button button');
    await wait(`${writes}.length === 2`, 'Explicit save retry');
    await run('(window.__finishConnection({ response: undefined }), true)');
    await wait(`${APP}.router.currentRoute.value.name === 'DAppsAuths'`, 'Successful retry returns to connections');
  }

  await resize(POPUP_WIDTH);
  await setLocale('en-EN');
  await fixture();
  await waitFor('.remove-connection', 'Remove connection');
  await keyboardFocus('.remove-connection');
  await enter();
  await wait(`${writes}.length === 1`, 'One isolated removal');
  if (
    await run(
      `document.querySelectorAll('.auth-content button:disabled').length !== 2 || ${writes}[0].request !== ${JSON.stringify(origin)}`
    )
  )
    throw new Error('Removal did not lock exact origin');
  await shot(
    '100-connections-remove-pending',
    'Pending removal keeps its public row visible and blocks competing actions'
  );
  await run(`(window.__finishConnection({ error: 'Public fixture write failed' }), true)`);
  await waitFor('.connections [role="alert"]', 'Removal error');
  await shot('101-connections-remove-error', 'Failed removal stays visible for an explicit retry');
  await click('.remove-connection');
  await wait(`${writes}.length === 2`, 'Explicit removal retry');
  await run('(window.__finishConnection({ response: { list: {} } }), true)');
  await wait(
    '!document.querySelector(".auth-content") && !!document.querySelector(".no-auths")',
    'Only acknowledged removal leaves the list'
  );
  await shot('102-connections-removed', 'Successful durable acknowledgement removes the public fixture row');

  await fixture('substrate', 'pending');
  await waitFor('.connections [role="status"]', 'Read loading');
  await shot('103-connections-read-pending', 'Loading permissions does not show cached rows or claim no connections');
  await run(`(window.__finishConnection({ error: 'Public fixture read failed' }), true)`);
  await waitFor('[data-testid="retryConnectionRead"] button', 'Retry list read');
  await shot('104-connections-read-error', 'Read failure is distinct from an empty list');
  await run('(window.__connectionFixture.holdRead = false, true)');
  await click('[data-testid="retryConnectionRead"] button');
  await waitFor('.auth-content', 'Retried list read');

  await fixture('evm');
  await waitFor('.auth-content .row-content', 'EVM public connection');
  await click('.auth-content .row-content');
  await waitFor('.connect-button button', 'EVM details');
  await shot('105-connections-evm-details', 'EVM management keeps a single eligible selected public identity');

  await resize(281, 300);
  await run("(document.documentElement.style.fontSize = '32px', true)");
  await fixture();
  await waitFor('.auth-content .row-content', 'Compact public connection');
  await keyboardFocus('.remove-connection');
  await shot('106-connections-compact-list', 'Complete origin and native removal at281×300 and200% root text');
  await click('.auth-content .row-content');
  await waitFor('.connect-button button', 'Compact details');
  await keyboardFocus('.connect-button button');
  await shot('107-connections-compact-details', 'Compact permission selection and reachable save at200% root text');
  await run(`(window.__connectionFixture.readError = true, true)`);
  await fixture('substrate', 'error');
  await run(
    `${APP}.router.push({ name: 'DAppDetails', params: { type: 'substrate', id: ${JSON.stringify(origin)} } }).then(() => true)`
  );
  await waitFor('.update-accounts [data-testid="retryConnectionRead"] button', 'Details read retry');
  await keyboardFocus('[data-testid="retryConnectionRead"] button');
  await shot('108-connections-details-read-error', 'Compact details read failure has a reachable translated retry');
  await resize(POPUP_WIDTH);
  await run("(document.documentElement.style.fontSize = '', true)");
  const failed = results.filter(
    (r) => r.pageWidth > r.viewportWidth || r.sheetControlsUnobscured === false || r.dialogControlsUnobscured === false
  );
  if (failed.length) throw new Error('Connection/authorization layout failed: ' + failed.map((r) => r.name).join(', '));
}
