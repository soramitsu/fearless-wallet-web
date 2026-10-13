import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { APP, servePopupOffline } from './extension-smoke-portfolio.mjs';

export async function captureJsonRecoveryNotice({ cdp, extensionId, send, address, password, outputDir, evaluate, waitForExpression }) {
  await send('pri(onboarding.setComplete)', null);
  await send('pri(accounts.update.current)', { address, walletEcosystem: 'substrate' });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 2, mobile: false }, sessionId);
  const stop = await servePopupOffline(cdp, sessionId);
  const results = [];
  const evalUi = (expression) => evaluate(cdp, sessionId, expression);
  const wait = (expression, label) => waitForExpression(cdp, sessionId, expression, label);
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await cdp.send('Page.navigate', { url: `chrome-extension://${extensionId}/popup.html` }, sessionId);
    await wait(`Boolean(${APP}) && ${APP}.pinia._s.get('accounts')?.selectedWallet.isMnemonicUnverified === true`, 'actual restored account recovery status');
    for (const locale of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
      for (const scale of [100, 200]) {
        await evalUi(`(${APP}.app.config.globalProperties.$i18n.locale = ${JSON.stringify(locale)}, document.documentElement.lang = ${JSON.stringify(locale)}, document.documentElement.style.fontSize = '${16 * scale / 100}px', true)`);
        for (const view of ['main', 'export']) {
          await evalUi(`${APP}.router.replace(${JSON.stringify(view === 'main' ? { name: 'Wallet' } : { name: 'Export', params: { network: 'Polkadot' } })}).then(() => true)`);
          const selector = view === 'main' ? '.json-backup-notice' : '.json-backup-note';
          if (view === 'export' && !await evalUi(`Boolean(document.querySelector('.json-backup-note'))`)) {
            await wait(`Boolean(document.querySelector('[data-testid="passwordExport"] input'))`, 'JSON export password form');
            await evalUi(`(() => { const input = document.querySelector('[data-testid="passwordExport"] input'); input.value = ${JSON.stringify(password)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
            await evalUi(`(document.querySelector('[data-testid="wantExportJsonBtn"] button').click(), true)`);
          }
          try {
            await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, `localized JSON recovery notice ${locale}/${scale}/${view}`);
          } catch (error) {
            const state = await evalUi(`({ route: ${APP}.router.currentRoute.value.fullPath, text: document.body.innerText, inputs: [...document.querySelectorAll('input')].map((input) => ({ type: input.type, length: input.value.length, disabled: input.disabled })), flag: ${APP}.pinia._s.get('accounts').selectedWallet.isMnemonicUnverified })`);
            await fs.writeFile(path.join(outputDir, 'failure-state.json'), JSON.stringify(state, null, 2) + '\n');
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
            await fs.writeFile(path.join(outputDir, 'failure.png'), Buffer.from(data, 'base64'));
            throw error;
          }
          await cdp.send('Page.bringToFront', {}, sessionId);
          await evalUi(`Promise.race([
            Promise.all([document.fonts.ready, ...document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))]).then(() => true),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Notice fonts/animation timeout')), 3000))
          ])`);
          const semantics = await evalUi(`new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Notice paint timeout')), 3000); requestAnimationFrame(() => requestAnimationFrame(() => {
            clearTimeout(timeout); const note = document.querySelector(${JSON.stringify(selector)}); const box = note.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(note); const text = range.getBoundingClientRect();
            resolve({ text: note.textContent.trim(), noteBox: box.toJSON(), textBox: text.toJSON(), role: note.getAttribute('role'), fontSize: parseFloat(getComputedStyle(note).fontSize), scrollHeight: note.scrollHeight, clientHeight: note.clientHeight,
              pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, internalFlag: ${APP}.pinia._s.get('accounts').selectedWallet.isMnemonicUnverified,
              exportLabels: [...document.querySelectorAll('.accounts-layout .row')].map((row) => row.textContent.trim()) });
          })); })`);
          if (!semantics.text || semantics.text.includes('accounts.jsonBackupOnly') || !semantics.internalFlag || semantics.noteBox.x < 0 || semantics.noteBox.right > 321 || semantics.textBox.right > 321) throw new Error('JSON recovery notice lost its status or horizontal containment');
          if (semantics.fontSize !== 14 * scale / 100) throw new Error('JSON recovery text did not scale');
          if (view === 'export' && (semantics.exportLabels.length !== 1 || semantics.exportLabels[0] !== 'JSON')) throw new Error('Unverified mnemonic was offered as recovery material');
          const name = `${locale}-${scale}-${view}`;
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
          await fs.writeFile(path.join(outputDir, `${name}.png`), Buffer.from(data, 'base64'));
          results.push({ name, locale, scale, view, ...semantics });
          if (view === 'main' && semantics.scrollHeight > semantics.clientHeight + 1) {
            await evalUi(`(document.querySelector('.json-backup-notice').focus(), true)`);
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }, sessionId);
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }, sessionId);
            await wait(`(() => { const note = document.querySelector('.json-backup-notice'); return note.scrollTop + note.clientHeight >= note.scrollHeight - 1; })()`, 'keyboard reaches the end of the recovery notice');
            const { data: endData } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
            await fs.writeFile(path.join(outputDir, `${name}-end.png`), Buffer.from(endData, 'base64'));
            results.at(-1).keyboardScrollReachedEnd = true;
          }
        }
      }
    }
    await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    return { count: results.length, directory: outputDir, actualRestoredAccountStatus: true };
  } finally {
    stop();
    await cdp.send('Target.closeTarget', { targetId });
  }
}
