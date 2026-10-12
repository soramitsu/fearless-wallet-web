import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// Public UI fixtures only. The popup port interceptor captures every approval and
// rejection before it reaches the worker; this never signs or broadcasts.
export async function captureWalletConnectOwnership({
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
  const approve = '[data-testid="approveWalletConnectSigning"] button';
  const reject = '[data-testid="rejectWalletConnectSigning"] button';
  const resize = (width) =>
    cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height: POPUP_HEIGHT,
        deviceScaleFactor: 2,
        mobile: false,
      },
      sessionId
    );
  const locale = (value) => run(`(${APP}.app.config.globalProperties.$i18n.locale=${JSON.stringify(value)}, true)`);
  await run(`(() => {
    window.__wcOwnershipFixture={requests:[]};
    const accounts=${APP}.pinia._s.get('accounts');
    window.__wcOldAccounts=JSON.parse(JSON.stringify(accounts.accounts));
    accounts.accounts.push({ ...accounts.accounts[0], name:'Reviewed signer', ethereumAddress:'0x1111111111111111111111111111111111111111' },
      { ...accounts.accounts[0], name:'Address-shaped message account', ethereumAddress:'0x2222222222222222222222222222222222222222' },
      { ...accounts.accounts[0], name:'Next signer', ethereumAddress:'0x3333333333333333333333333333333333333333' });
    window.__wcFirst={ id:7, topic:'public-same-session', approvalId:'public-first',
      params:{chainId:'eip155:1',request:{method:'personal_sign',params:['0x2222222222222222222222222222222222222222','0x1111111111111111111111111111111111111111']}},
      verifyContext:{verified:{origin:'https://first.public-fixture.example.invalid',validation:'UNKNOWN',verifyUrl:''}} };
    window.__wcNext=structuredClone(window.__wcFirst);
    window.__wcNext.id=8; window.__wcNext.approvalId='public-next';
    window.__wcNext.params.request.params=['0xbeef','0x3333333333333333333333333333333333333333'];
    window.__wcNext.verifyContext.verified.origin='https://next.public-fixture.example.invalid';
    ${APP}.pinia._s.get('extension').wcRequests=[window.__wcFirst,window.__wcNext]; return true;
  })()`);
  await route('WalletConnectSignConfirmation');
  await waitFor(reject, 'WalletConnect Cancel');
  await wait(`document.activeElement===document.querySelector(${JSON.stringify(reject)})`, 'Default Cancel focus');
  for (const lang of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
    await locale(lang);
    await resize(lang === 'en-EN' ? POPUP_WIDTH : 320);
    await keyboardFocus(reject);
    const state = await run(`(() => {
      const text=document.querySelector('.wc-request__details').textContent;
      const a=document.querySelector(${JSON.stringify(approve)}), r=document.querySelector(${JSON.stringify(reject)});
      return { signerCorrect:text.includes('Reviewed signer') && !text.includes('Address-shaped message account'),
        defaultCancel:document.activeElement===r, submitted:window.__wcOwnershipFixture.requests.length,
        approveEnabled:a.getAttribute('aria-disabled')!=='true', noOverflow:document.documentElement.scrollWidth<=innerWidth,
        minTargetHeight:Math.min(a.getBoundingClientRect().height,r.getBoundingClientRect().height) };
    })()`);
    if (
      !state.signerCorrect ||
      !state.defaultCancel ||
      state.submitted ||
      !state.approveEnabled ||
      !state.noOverflow ||
      state.minTargetHeight < 48
    )
      throw new Error('WalletConnect ownership screen failed: ' + JSON.stringify(state));
    await capture('wc-ownership-' + lang, 'Method-defined signer for address-shaped public message; ' + lang);
    Object.assign(results.at(-1), { ownership: state });
  }
  await locale('en-EN');
  await resize(POPUP_WIDTH);
  const stale = await run(`(() => {
    const old=document.querySelector(${JSON.stringify(approve)});
    ${APP}.pinia._s.get('extension').wcRequests=[window.__wcNext]; old.click();
    return window.__wcOwnershipFixture.requests.length;
  })()`);
  if (stale !== 0) throw new Error('Old DOM approved replacement request');
  await wait(
    `document.querySelector('.wc-request__details').textContent.includes('Next signer')`,
    'Next signer renders'
  );
  await run(`(${APP}.pinia._s.get('extension').wcRequests=[window.__wcFirst,window.__wcNext], true)`);
  await wait(
    `document.querySelector('.wc-request__details').textContent.includes('Reviewed signer')`,
    'First request restored'
  );
  await click(approve);
  await wait(`window.__wcOwnershipFixture.requests.length===1`, 'One exact approval captured');
  await click(approve);
  await click(reject);
  const pending = await run(`({ count:window.__wcOwnershipFixture.requests.length,
    approveDisabled:document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')==='true',
    rejectDisabled:document.querySelector(${JSON.stringify(reject)}).getAttribute('aria-disabled')==='true' })`);
  if (pending.count !== 1 || !pending.approveDisabled || !pending.rejectDisabled)
    throw new Error('Pending WalletConnect action duplicated: ' + JSON.stringify(pending));
  await capture('wc-ownership-pending', 'One pending captured approval; both actions disabled');
  Object.assign(results.at(-1), { ownership: pending });
  await run(`(${APP}.pinia._s.get('extension').wcRequests=[window.__wcNext], true)`);
  await wait(
    `document.querySelector('.wc-request__details').textContent.includes('Next signer')`,
    'Replacement request visible'
  );
  await run(`(window.__finishWcOwnership({error:'Public old approval failure'}), true)`);
  await wait(
    `document.querySelector(${JSON.stringify(reject)}).getAttribute('aria-disabled')!=='true'`,
    'Old failure settled'
  );
  const replaced =
    await run(`({ error:!!document.querySelector('[role="alert"]'), count:window.__wcOwnershipFixture.requests.length,
    next:document.querySelector('.wc-request__details').textContent.includes('0xbeef'),
    focused:document.activeElement===document.querySelector(${JSON.stringify(reject)}) })`);
  if (replaced.error || replaced.count !== 1 || !replaced.next || !replaced.focused)
    throw new Error('Late WalletConnect failure affected replacement: ' + JSON.stringify(replaced));
  await capture('wc-ownership-replacement', 'Late failure does not reject, hide or alter the next request');
  Object.assign(results.at(-1), { ownership: replaced });
  await click(reject);
  await wait(`window.__wcOwnershipFixture.requests.length===2`, 'First rejection captured');
  await run(`(window.__finishWcOwnership({error:'Public rejection failure'}), true)`);
  await wait(`!!document.querySelector('[role="alert"]')`, 'Retryable rejection error visible');
  await capture('wc-ownership-retry', 'Failed rejection leaves the displayed request available to retry');
  await click(reject);
  await wait(`window.__wcOwnershipFixture.requests.length===3`, 'Retry rejection captured');
  const submitted = await run(`window.__wcOwnershipFixture.requests`);
  if (
    submitted[0].message !== 'pri(walletConnect.request.approve)' ||
    submitted[0].request.approvalId !== 'public-first' ||
    submitted[0].request.address !== '0x1111111111111111111111111111111111111111' ||
    submitted
      .slice(1)
      .some((item) => item.message !== 'pri(walletConnect.request.reject)' || item.request.approvalId !== 'public-next')
  )
    throw new Error('WalletConnect submitted the wrong identity: ' + JSON.stringify(submitted));
  await run(
    `(() => { ${APP}.pinia._s.get('extension').wcRequests=[]; window.__finishWcOwnership({response:true}); return true; })()`
  );
  await wait(
    `${APP}.router.currentRoute.value.name!=='WalletConnectSignConfirmation'`,
    'Empty queue exits approval route'
  );
  await capture('wc-ownership-empty', 'Empty queue safely leaves the approval screen');
  Object.assign(results.at(-1), {
    ownership: { submitted, staleDomClickBlocked: true, emptyQueueExited: true, workerReceivedNoFixtureAction: true },
  });
  await run(`(() => { ${APP}.pinia._s.get('accounts').accounts=window.__wcOldAccounts;
    delete window.__wcOwnershipFixture; delete window.__wcFirst; delete window.__wcNext; delete window.__wcOldAccounts;
    return true; })()`);
}
