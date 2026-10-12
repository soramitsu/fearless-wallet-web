import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// Display-only public requests. The port interceptor consumes approvals/rejections
// in this popup before the worker receives them; no signature or transaction is sent.
export async function captureSigningScreenshots({
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
  const approve = '[data-testid="approveSigning"] button';
  const reject = '[data-testid="rejectSigning"] button';
  const resize = (width, height) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  const locale = (value) =>
    run(
      `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(value)}, document.documentElement.lang = ${JSON.stringify(value)}, true)`
    );
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await locale('en-EN');
  await run(`(() => {
    window.__signingFixture = { requests: [] };
    window.__publicSigning = { id: 'public-signing-one', url: 'https://long-origin.public-fixture.example.invalid/provider',
      method: 'personal_sign', data: ['0xff00c080deadbeef', '0x1111111111111111111111111111111111111111'],
      account: { address: '0x1111111111111111111111111111111111111111', name: 'Public account with a complete visible address', isMobile: false },
      network: { name: 'Ethereum', chainId: '1', genesisHash: '0x' + '12'.repeat(32), symbol: 'ETH', decimals: 18 } };
    const store = ${APP}.pinia._s.get('extension');
    store.signRequests = []; store.signSolanaRequests = {}; store.signEvmRequests = { [window.__publicSigning.id]: window.__publicSigning };
    return true;
  })()`);
  await route('Transaction');
  await waitFor(reject, 'Signing Reject');
  await wait(
    `document.activeElement === document.querySelector(${JSON.stringify(reject)})`,
    'Signing defaults to Reject'
  );
  const locales = (process.env.SIGNING_REVIEW_LOCALES || 'en-EN,ru-RU,akk-Xsux-x-old,egy-Egyp').split(',');
  for (const lang of locales) {
    await locale(lang);
    await resize(lang === 'en-EN' ? POPUP_WIDTH : 320, POPUP_HEIGHT);
    const translated = await run(
      `${APP}.app.config.globalProperties.$te('signingReview.blindWarning', ${JSON.stringify(lang)})`
    );
    if (!translated) throw new Error('Signing warning is missing from ' + lang);
    await run(`(document.querySelector('.signing-requester').scrollIntoView({ block: 'start' }), true)`);
    await capture('77-signing-' + lang + '-top', 'Blind signing requester, method, exact account and network; ' + lang);
    await keyboardFocus(reject);
    const geometry = await run(`(() => {
      const a = document.querySelector(${JSON.stringify(approve)}), r = document.querySelector(${JSON.stringify(reject)});
      const ab = a.getBoundingClientRect(), rb = r.getBoundingClientRect();
      return { fullAccount: document.querySelector('.signing-wallet__address').textContent === window.__publicSigning.account.address,
        fullOrigin: document.querySelector('.signing-origin').textContent === new URL(window.__publicSigning.url).origin,
        domain: document.querySelector('.signing-origin strong').textContent,
        focusedReject: document.activeElement === r, disabled: a.getAttribute('aria-disabled') === 'true',
        touchHeight: Math.min(ab.height, rb.height), equalWidth: Math.abs(ab.width-rb.width)<1,
        rawCollapsed: !document.querySelector('.signing-raw').open, checkboxClear: !document.querySelector('.fw-checkbox input').checked,
        labelsFit: [a,r].every(button => { const label=button.querySelector('span'); return label.scrollWidth<=label.clientWidth+1; }),
        noOverflow: document.documentElement.scrollWidth<=innerWidth, calm: !!document.querySelector('.fw-calm'), submitted: window.__signingFixture.requests.length };
    })()`);
    if (
      !geometry.fullAccount ||
      !geometry.fullOrigin ||
      !geometry.focusedReject ||
      !geometry.disabled ||
      geometry.touchHeight < 48 ||
      !geometry.equalWidth ||
      !geometry.rawCollapsed ||
      !geometry.checkboxClear ||
      !geometry.labelsFit ||
      !geometry.noOverflow ||
      !geometry.calm ||
      geometry.submitted
    )
      throw new Error('Signing review geometry/consent failure: ' + JSON.stringify(geometry));
    await capture(
      '78-signing-' + lang + '-consent',
      'Explicit blind-signing warning, unchecked acknowledgment and default Reject; ' + lang
    );
    Object.assign(results.at(-1), { signing: geometry });
  }
  await locale('en-EN');
  await resize(281, 300);
  await run(`(document.documentElement.style.fontSize='32px', true)`);
  await keyboardFocus(reject);
  await capture('79-signing-compact-large-text', 'Blind-signing controls at 281 × 300 with 200% root text size');
  const large = await run(
    `(() => { const a=document.querySelector(${JSON.stringify(approve)}).getBoundingClientRect(), r=document.querySelector(${JSON.stringify(reject)}).getBoundingClientRect(); return { contentHeight: document.querySelector('.form-background .content').getBoundingClientRect().height, noOverflow: document.documentElement.scrollWidth<=innerWidth, stacked: a.top>=r.bottom, equalWidth: Math.abs(a.width-r.width)<1, target: Math.min(a.height,r.height) }; })()`
  );
  if (large.contentHeight < 140 || !large.noOverflow || !large.stacked || !large.equalWidth || large.target < 48)
    throw new Error('Large signing controls failed: ' + JSON.stringify(large));
  Object.assign(results.at(-1), { signing: large });
  await run(`(document.documentElement.style.fontSize='', true)`);
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await click('.signing-raw summary');
  await wait(
    `document.querySelector('.signing-raw').open && !!document.querySelector('.signing-raw pre')`,
    'Raw signing data expanded'
  );
  await click('.fw-checkbox');
  await wait(
    `document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled') !== 'true'`,
    'Explicit blind consent permits signing'
  );
  await keyboardFocus(approve);
  await capture(
    '80-signing-blind-consent-ready',
    'Raw request open and risk acknowledged; Sign anyway becomes available'
  );
  await click(approve);
  await wait(`window.__signingFixture.requests.length === 1`, 'Exactly one captured approval');
  await capture('81-signing-pending', 'Captured approval is pending; no request reaches the signing worker');
  await run(
    `(() => { const next = structuredClone(window.__publicSigning); next.id='public-signing-two'; next.url='https://second.public-fixture.example.invalid'; ${APP}.pinia._s.get('extension').signEvmRequests={ [next.id]: next }; window.__finishSigning({ response: true }); return true; })()`
  );
  await wait(
    `!document.querySelector('.signing-raw').open && !document.querySelector('.fw-checkbox input').checked && document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')==='true'`,
    'New request clears the old consent'
  );
  await keyboardFocus(reject);
  await capture('82-signing-replacement', 'Second request cannot inherit the first request’s consent');
  await wait(`!document.querySelector('.el-notification')`, 'Signing toast settles before reviewing a flagged request');
  await run(
    `(() => { const next=structuredClone(window.__publicSigning); next.id='public-flagged'; next.url='https://flagged.example.invalid'; ${APP}.pinia._s.get('extension').signEvmRequests={ [next.id]: next }; return true; })()`
  );
  await wait(
    `!!document.querySelector('.signing-status--flagged') && !document.querySelector(${JSON.stringify(approve)})`,
    'Phishing requester has no signing action'
  );
  await keyboardFocus(reject);
  await capture('83-signing-flagged', 'Local deny-list fixture: phishing status, Close only, no signing action');
  await run(
    `(() => { const next=structuredClone(window.__publicSigning); next.id='public-readable'; next.data[0]='0x48656c6c6f20776f726c64'; ${APP}.pinia._s.get('extension').signEvmRequests={ [next.id]: next }; return true; })()`
  );
  await wait(
    `document.querySelector('.signing-message')?.textContent==='Hello world'`,
    'Readable exact signing message'
  );
  await keyboardFocus(reject);
  await capture(
    '84-signing-readable',
    'Readable message with secondary Reject and primary Approve; no automatic signing'
  );
  const requests = await run(`window.__signingFixture.requests`);
  if (
    requests.length !== 1 ||
    requests[0].request.id !== 'public-signing-one' ||
    requests[0].message !== 'pri(signing.approve)'
  )
    throw new Error('Unexpected signing submission ' + JSON.stringify(requests));
  await run(
    `(() => { const store=${APP}.pinia._s.get('extension'); store.signRequests=[]; store.signEvmRequests={}; store.signSolanaRequests={}; delete window.__signingFixture; return true; })()`
  );
  await route('Currencies');
}
