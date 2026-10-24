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
  const resize = (width, height = POPUP_HEIGHT) =>
    cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height,
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
    window.__wcFirst.context={session:{topic:'public-same-session',peerPublicKey:'public-peer',origin:window.__wcFirst.verifyContext.verified.origin,revision:0},
      account:{address:'0x1111111111111111111111111111111111111111',name:'Reviewed signer',isMobile:false},
      network:{name:'Ethereum',chainId:'1',genesisHash:'0x1234',symbol:'ETH',decimals:18}};
    window.__wcNext=structuredClone(window.__wcFirst);
    window.__wcNext.id=8; window.__wcNext.approvalId='public-next';
    window.__wcNext.params.request.params=['0xbeef','0x3333333333333333333333333333333333333333'];
    window.__wcNext.verifyContext.verified.origin='https://next.public-fixture.example.invalid';
    window.__wcNext.context.session.origin=window.__wcNext.verifyContext.verified.origin;
    window.__wcNext.context.account={address:'0x3333333333333333333333333333333333333333',name:'Next signer',isMobile:false};
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
      const text=document.querySelector('.signing-review').textContent;
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
    await run(`(document.querySelector('.signing-requester').scrollIntoView({block:'start'}), true)`);
    const requesterVisible = await run(
      `(() => { const r=document.querySelector('.signing-requester').getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight; })()`
    );
    if (!requesterVisible) throw new Error('WalletConnect requester is outside the top capture');
    await capture('wc-review-' + lang + '-top', 'Complete captured requester/account/network; ' + lang);
    await keyboardFocus(reject);
    await capture('wc-ownership-' + lang, 'Method-defined signer for address-shaped public message; ' + lang);
    Object.assign(results.at(-1), { ownership: state });
  }
  await locale('en-EN');
  await resize(POPUP_WIDTH);
  await run(`(() => {
    window.__wcTx=structuredClone(window.__wcFirst);
    window.__wcTx.params.request={method:'eth_sendTransaction',params:[{from:window.__wcFirst.context.account.address,
      to:'0x4444444444444444444444444444444444444444',value:'0xde0b6b3a7640000',gas:'0x5208',gasPrice:'0x77359400'}]};
    ${APP}.pinia._s.get('extension').wcRequests=[window.__wcTx]; return true;
  })()`);
  await wait(`!!document.querySelector('.signing-amount')`, 'WalletConnect transaction review');
  for (const lang of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
    await locale(lang);
    await resize(lang === 'en-EN' ? POPUP_WIDTH : 320);
    const tx = await run(`(() => { const text=document.querySelector('.signing-review').textContent;
      return { complete:text.includes('0x4444444444444444444444444444444444444444') && text.includes('1.0 ETH'),
        fee:text.includes('0.000042 ETH'), blind:document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')==='true',
        unchecked:!document.querySelector('.fw-checkbox input').checked, noOverflow:document.documentElement.scrollWidth<=innerWidth };
    })()`);
    if (!tx.complete || !tx.fee || !tx.blind || !tx.unchecked || !tx.noOverflow)
      throw new Error('WalletConnect transaction summary failed: ' + JSON.stringify(tx));
    await run(`(document.querySelector('.signing-action').scrollIntoView({block:'start'}), true)`);
    await capture('wc-review-transaction-' + lang, 'Full native amount/destination and honest maximum fee; ' + lang);
    Object.assign(results.at(-1), { walletConnectReview: tx });
    await run(`(document.querySelector('.signing-context').scrollIntoView({block:'start'}), true)`);
    await capture('wc-review-context-' + lang, 'Captured account/network and maximum fee; ' + lang);
    await keyboardFocus(reject);
    await capture('wc-review-consent-' + lang, 'Raw-review and consent required; ' + lang);
  }
  await locale('en-EN');
  await resize(281, 300);
  await run(
    `(document.documentElement.style.fontSize='32px', document.querySelector('.form-background .form').scrollTop=0, true)`
  );
  await capture('wc-review-compact-top', '281 by 300 viewport with 200% root text');
  const heading = await run(
    `(() => { const b=document.querySelector('.form-background .header').getBoundingClientRect(); return {top:b.top,bottom:b.bottom}; })()`
  );
  if (heading.top < 0 || heading.bottom > 300) throw new Error('WalletConnect compact header clips');
  await keyboardFocus(reject);
  const large =
    await run(`(() => { const a=document.querySelector(${JSON.stringify(approve)}).getBoundingClientRect(), r=document.querySelector(${JSON.stringify(reject)}).getBoundingClientRect();
    return { noOverflow:document.documentElement.scrollWidth<=innerWidth, stacked:a.top>=r.bottom, equalWidth:Math.abs(a.width-r.width)<1, target:Math.min(a.height,r.height) }; })()`);
  if (!large.noOverflow || !large.stacked || !large.equalWidth || large.target < 48)
    throw new Error('WalletConnect compact controls failed: ' + JSON.stringify(large));
  await capture('wc-review-compact-consent', 'Stacked full-width actions and readable blind consent');
  Object.assign(results.at(-1), { walletConnectReview: large });
  await run(`(document.documentElement.style.fontSize='', true)`);
  await resize(POPUP_WIDTH);
  await click('.signing-raw summary');
  await wait(`!!document.querySelector('.signing-raw pre')`, 'Complete WalletConnect raw request');
  const raw = await run(`document.querySelector('.signing-raw pre').textContent`);
  if (!raw.includes('eip155:1') || !raw.includes('eth_sendTransaction') || !raw.includes('0x5208'))
    throw new Error('WalletConnect raw request truncated');
  await click('.fw-checkbox');
  await wait(
    `document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')!=='true'`,
    'WalletConnect explicit consent'
  );
  await keyboardFocus(approve);
  await capture('wc-review-consent-ready', 'Complete raw request and explicit risk acknowledgement permit signing');
  await run(`(() => { const v=structuredClone(window.__wcFirst); v.verifyContext.verified.isScam=true;
    ${APP}.pinia._s.get('extension').wcRequests=[v]; return true; })()`);
  await wait(`!document.querySelector(${JSON.stringify(approve)})`, 'Scam warning removes WalletConnect approval');
  await capture('wc-review-flagged', 'Flagged requester only offers Close');
  await run(`(() => { const v=structuredClone(window.__wcFirst); delete v.context;
    ${APP}.pinia._s.get('extension').wcRequests=[v]; return true; })()`);
  await wait(
    `!!document.querySelector('.signing-warning') && !document.querySelector(${JSON.stringify(approve)})`,
    'Missing WalletConnect context blocked'
  );
  await capture('wc-review-unqualified', 'Legacy request lacking captured context cannot be approved');
  await run(`(() => { const v=structuredClone(window.__wcFirst);
    v.params.request={method:'eth_signTypedData_v4',params:[v.context.account.address,{types:{EIP712Domain:[{name:'chainId',type:'uint256'}],Permission:[{name:'approved',type:'bool'}]},primaryType:'Permission',domain:{chainId:1},message:{approved:false}}]};
    ${APP}.pinia._s.get('extension').wcRequests=[v]; return true; })()`);
  await wait(`!!document.querySelector('.signing-message')`, 'WalletConnect typed-data message');
  for (const lang of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
    await locale(lang);
    await resize(lang === 'en-EN' ? POPUP_WIDTH : 320);
    const typed = await run(
      `({text:document.querySelector('.signing-message').textContent,allowed:document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')!=='true'})`
    );
    if (!typed.text.includes('"approved": false') || !typed.allowed)
      throw new Error('WalletConnect typed Boolean review failed');
    await run(`(document.querySelector('.signing-message').scrollIntoView({block:'center'}), true)`);
    await capture('wc-review-typed-false-' + lang, 'Structured typed data preserves false; ' + lang);
  }
  await locale('en-EN');
  await resize(POPUP_WIDTH);
  await run(`(${APP}.pinia._s.get('extension').wcRequests=[window.__wcFirst,window.__wcNext], true)`);
  await wait(
    `!!document.querySelector(${JSON.stringify(approve)}) && document.querySelector('.signing-review').textContent.includes('Reviewed signer')`,
    'Original ownership fixture restored'
  );
  if (await run(`window.__wcOwnershipFixture.requests.length`))
    throw new Error('Review performed an automatic approval');
  const stale = await run(`(() => {
    const old=document.querySelector(${JSON.stringify(approve)});
    ${APP}.pinia._s.get('extension').wcRequests=[window.__wcNext]; old.click();
    return window.__wcOwnershipFixture.requests.length;
  })()`);
  if (stale !== 0) throw new Error('Old DOM approved replacement request');
  await wait(`document.querySelector('.signing-review').textContent.includes('Next signer')`, 'Next signer renders');
  await run(`(${APP}.pinia._s.get('extension').wcRequests=[window.__wcFirst,window.__wcNext], true)`);
  await wait(
    `document.querySelector('.signing-review').textContent.includes('Reviewed signer')`,
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
    `document.querySelector('.signing-review').textContent.includes('Next signer')`,
    'Replacement request visible'
  );
  await run(`(window.__finishWcOwnership({error:'Public old approval failure'}), true)`);
  await wait(
    `document.querySelector(${JSON.stringify(reject)}).getAttribute('aria-disabled')!=='true'`,
    'Old failure settled'
  );
  const replaced =
    await run(`({ error:!!document.querySelector('[role="alert"]:not(.signing-warning)'), count:window.__wcOwnershipFixture.requests.length,
    next:document.querySelector('.signing-review').textContent.includes('Next signer'),
    focused:document.activeElement===document.querySelector(${JSON.stringify(reject)}) })`);
  if (replaced.error || replaced.count !== 1 || !replaced.next || !replaced.focused)
    throw new Error('Late WalletConnect failure affected replacement: ' + JSON.stringify(replaced));
  await capture('wc-ownership-replacement', 'Late failure does not reject, hide or alter the next request');
  Object.assign(results.at(-1), { ownership: replaced });
  await click(reject);
  await wait(`window.__wcOwnershipFixture.requests.length===2`, 'First rejection captured');
  await run(`(window.__finishWcOwnership({error:'Public rejection failure'}), true)`);
  await wait(`!!document.querySelector('[role="alert"]:not(.signing-warning)')`, 'Retryable rejection error visible');
  const errorVisible = await run(
    `(() => { const e=document.querySelector('[role="alert"]:not(.signing-warning)').getBoundingClientRect(); const h=document.querySelector('.header-content').getBoundingClientRect(); return e.top>=Math.max(0,h.bottom) && e.bottom<=innerHeight; })()`
  );
  if (!errorVisible) throw new Error('WalletConnect retry feedback is outside the viewport');
  await capture('wc-ownership-retry', 'Failed rejection leaves the displayed request available to retry');
  Object.assign(results.at(-1), { retryFeedbackVisible: errorVisible });
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
    delete window.__wcOwnershipFixture; delete window.__wcFirst; delete window.__wcNext; delete window.__wcOldAccounts; delete window.__wcTx;
    return true; })()`);
}
