import { APP, POPUP_HEIGHT, POPUP_WIDTH } from './extension-smoke-portfolio.mjs';

// Public display-only metadata. The popup port interceptor captures every response before
// the background sees it, so this cannot install metadata or contact a requesting website.
export async function captureMetadataScreenshots({
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
  const approve = '[data-testid="approveMetadata"] button';
  const reject = '[data-testid="rejectMetadata"] button';
  const resize = (width, height) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  const locale = (value) =>
    run(
      `(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(value)}, document.documentElement.lang = ${JSON.stringify(value)}, true)`
    );
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
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await locale('en-US');
  await run(`(() => {
    window.__metadataFixture = { requests: [] };
    window.__publicMetadata = { id: 'public-metadata-one', url: 'https://long-origin.public-fixture.example.invalid/metadata-provider', request: {
      chain: 'Public exact-network metadata fixture', genesisHash: '0x' + '12'.repeat(32), icon: 'polkadot', ss58Format: 0,
      specVersion: 12, tokenDecimals: 10, tokenSymbol: 'DOT', types: {}, metaCalls: '0x' + 'ab'.repeat(180)
    } };
    ${APP}.pinia._s.get('extension').metaRequests = [window.__publicMetadata];
    return true;
  })()`);
  await route('MetaRequest');
  await waitFor(reject, 'Metadata Reject');
  await wait(
    `document.activeElement === document.querySelector(${JSON.stringify(reject)})`,
    'Metadata defaults to Reject'
  );
  const variants = [
    { name: '62-metadata-review', width: POPUP_WIDTH, height: POPUP_HEIGHT, locale: 'en-US' },
    { name: '63-metadata-russian', width: 320, height: 600, locale: 'ru-RU' },
    { name: '64-metadata-akkadian', width: 320, height: 600, locale: 'akk-Xsux-x-old' },
    { name: '65-metadata-egyptian', width: 320, height: 600, locale: 'egy-Egyp' },
    { name: '66-metadata-compact', width: 281, height: 300, locale: 'en-US' },
  ];
  for (const variant of variants) {
    await resize(variant.width, variant.height);
    await locale(variant.locale);
    await keyboardFocus(reject);
    const geometry = await run(`(() => {
      const approve = document.querySelector(${JSON.stringify(approve)}), reject = document.querySelector(${JSON.stringify(reject)});
      const a = approve.getBoundingClientRect(), r = reject.getBoundingClientRect();
      const fields = document.querySelector('.metadata-fields');
      const header = document.querySelector('.form-background [data-testid="header"]');
      const h = header.getBoundingClientRect();
      const logo = document.querySelector('.form-background .align-left .logo').getBoundingClientRect();
      const close = document.querySelector('.form-background .align-right button').getBoundingClientRect();
      return { equalActions: Math.abs(a.width-r.width)<1 && Math.abs(a.height-r.height)<1, touchHeight: Math.min(a.height,r.height), focusedReject: document.activeElement===reject,
        fullOrigin: fields.textContent.includes(window.__publicMetadata.url), fullGenesis: fields.textContent.includes(window.__publicMetadata.request.genesisHash),
        translatedHeading: !!header.textContent.trim() && !header.textContent.includes('.'), headerAvoidsIcons: h.left>=logo.right+4 && h.right<=close.left-4,
        noOverflow: document.documentElement.scrollWidth<=innerWidth, rawCollapsed: !document.querySelector('.metadata-payload').open,
        labelsFit: [approve,reject].every(button => {const label=button.querySelector('span');return label.scrollWidth<=label.clientWidth+1}),
        calm: !!document.querySelector('.fw-calm'), submitted: window.__metadataFixture.requests.length };
    })()`);
    if (
      !geometry.equalActions ||
      geometry.touchHeight < 48 ||
      !geometry.focusedReject ||
      !geometry.fullOrigin ||
      !geometry.fullGenesis ||
      !geometry.translatedHeading ||
      !geometry.headerAvoidsIcons ||
      !geometry.noOverflow ||
      !geometry.rawCollapsed ||
      !geometry.labelsFit ||
      !geometry.calm ||
      geometry.submitted
    )
      throw new Error(
        'Metadata review lost exact data, Calm state or accessible geometry: ' + JSON.stringify(geometry)
      );
    await capture(
      variant.name,
      'Public metadata request: full network genesis and requester; explicit equal actions, raw payload collapsed; ' +
        variant.locale
    );
    Object.assign(results.at(-1), { metadata: geometry });
  }
  await resize(POPUP_WIDTH, POPUP_HEIGHT);
  await locale('en-US');
  await keyboardFocus('.metadata-payload summary');
  await enter();
  await wait(`!!document.querySelector('.metadata-payload pre')`, 'Raw metadata opened by keyboard');
  const raw = await run(
    `({ open: document.querySelector('.metadata-payload').open, exact: document.querySelector('.metadata-payload pre').textContent === JSON.stringify(window.__publicMetadata.request,null,2), noOverflow: document.documentElement.scrollWidth<=innerWidth })`
  );
  if (!raw.open || !raw.exact || !raw.noOverflow) throw new Error('Raw metadata lost payload or contained scrolling');
  await capture(
    '67-metadata-raw',
    'Raw metadata expanded with native keyboard control, preserving every payload byte in a scrollable pane.'
  );
  Object.assign(results.at(-1), { rawMetadata: raw });
  await keyboardFocus(approve);
  await enter();
  await wait(`window.__metadataFixture.requests.length===1`, 'Metadata approval held at isolated popup port');
  await enter();
  const pending = await run(
    `({ requests: window.__metadataFixture.requests, rejectDisabled: document.querySelector(${JSON.stringify(reject)}).disabled, approveDisabled: document.querySelector(${JSON.stringify(approve)}).getAttribute('aria-disabled')==='true', closeAbsent: !document.querySelector('.form-background .align-right button') })`
  );
  if (
    pending.requests.length !== 1 ||
    pending.requests[0].message !== 'pri(metadata.approve)' ||
    pending.requests[0].request.id !== 'public-metadata-one' ||
    !pending.rejectDisabled ||
    !pending.approveDisabled ||
    !pending.closeAbsent
  )
    throw new Error('Metadata duplicate response or pending controls changed: ' + JSON.stringify(pending));
  await capture(
    '68-metadata-pending',
    'The exact public request ID is approved once; controls cannot submit a competing response while pending.'
  );
  Object.assign(results.at(-1), { metadataPending: pending });
  await run(`(window.__finishMetadata({error:'Public fixture worker unavailable'}),true)`);
  await wait(`!!document.querySelector('.meta-content [role="alert"]')`, 'Metadata failure is retryable');
  await capture(
    '69-metadata-retry',
    'Public fixture response failure exposes a retryable error without leaving the request.'
  );
  await click(approve);
  await wait(`window.__metadataFixture.requests.length===2`, 'Metadata retry captured');
  await run(`(() => {
    ${APP}.pinia._s.get('extension').metaRequests = [{...window.__publicMetadata,id:'public-metadata-two',url:'https://next.public-fixture.example.invalid',request:{...window.__publicMetadata.request,chain:'Next public metadata',metaCalls:'0x9999'}}];
    window.__finishMetadata({error:'Previous request expired'}); return true;
  })()`);
  await wait(
    `!document.querySelector('.meta-content [role="alert"]') && document.activeElement===document.querySelector(${JSON.stringify(reject)}) && !document.querySelector(${JSON.stringify(reject)}).disabled`,
    'Replacement metadata defaults to Reject after old response'
  );
  const replaced = await run(
    `({ rawCollapsed: !document.querySelector('.metadata-payload').open && !document.querySelector('.metadata-payload pre'), newOrigin: document.querySelector('.metadata-fields').textContent.includes('https://next.public-fixture.example.invalid'), focusedReject: document.activeElement===document.querySelector(${JSON.stringify(reject)}) })`
  );
  if (!replaced.rawCollapsed || !replaced.newOrigin || !replaced.focusedReject)
    throw new Error('Previous metadata state leaked into replacement');
  await capture(
    '70-metadata-next-request',
    'Replacement metadata has its own origin and collapsed payload, no stale error and Reject keyboard focus.'
  );
  Object.assign(results.at(-1), { metadataReplacement: replaced });
  await enter();
  await wait(`window.__metadataFixture.requests.length===3`, 'Replacement metadata rejection captured');
  const rejection = await run(`window.__metadataFixture.requests[2]`);
  if (rejection.message !== 'pri(metadata.reject)' || rejection.request.id !== 'public-metadata-two')
    throw new Error('Metadata rejection changed identity');
  await run(`(window.__finishMetadata({response:true}),true)`);
  await wait(`${APP}.router.currentRoute.value.name!=='MetaRequest'`, 'Empty metadata queue safely leaves screen');
  await run(`(delete window.__metadataFixture,true)`);
  await route('Currencies');
}
