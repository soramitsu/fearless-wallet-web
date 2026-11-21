// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NetworkId } from '@iroha/iroha-js/browser';
import {
  createConnectAppSession,
  createConnectSessionPreview,
  registerConnectSession,
} from '@iroha/iroha-js/connect-browser';
import {
  browserTransactionPayloadHashHex,
  buildBrowserExecutableBatchPayload,
  buildBrowserTransferPayload,
} from '@iroha/iroha-js/transaction-codec';
import { ed25519 } from '@noble/curves/ed25519';
import { HDNodeWallet } from 'ethers';

import { IROHA_CONNECT_PROFILES } from '@extension-base/services/iroha-connect-service/wire';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { encodeIrohaI105Address } from '@/util/iroha';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';

// The built extension in Chrome for Testing pairs with a live Taira dApp session: the person pastes the link into the
// IrohaConnect page, approves the connection there, reviews and approves a transfer and a contract call on the decoded
// review, the session survives the extension worker's keepalive interval, a raw request is declined with a notice,
// and Disconnect ends the dApp's session. Nothing is submitted to the chain.
//
//   FEARLESS_IROHA_CONNECT_EXTENSION=<abs dist/extension/chrome> CHROME_BIN=<Chrome for Testing> \
//     [FEARLESS_IROHA_CONNECT_REPORT_DIR=<dir>] vitest run tests/smoke/iroha-connect-extension.spec.ts

const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env ?? {};
const extensionDir = env.FEARLESS_IROHA_CONNECT_EXTENSION;
const chromeBinary = env.CHROME_BIN;
const enabled = Boolean(extensionDir && chromeBinary);
const liveTest = enabled ? it : it.skip;

const TAIRA = IROHA_CONNECT_PROFILES.taira;
const XOR = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id;
const CONTRACT = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const PASSWORD = 'fearless-iroha-connect-smoke-password';
const PORT_EXTENSION = 'fw-fearless-extension';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually<T>(check: () => Promise<T> | T, description: string, timeoutMs = 60_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value as NonNullable<T>;
    } catch (error) {
      lastError = error;
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${(lastError as Error).message}` : ''}`);
}

// DevTools over --remote-debugging-pipe: NUL-separated JSON messages.
class Cdp {
  private buffer = '';
  // CDP results are untyped JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly callbacks = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private id = 0;

  constructor(private readonly chrome: ChildProcess) {
    (chrome.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => this.onData(chunk));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, 120_000);
      this.callbacks.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      (this.chrome.stdio[3] as NodeJS.WritableStream).write(
        `${JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })}\0`
      );
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    let end = this.buffer.indexOf('\0');
    while (end >= 0) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      end = this.buffer.indexOf('\0');
      if (!raw.trim()) continue;
      const message = JSON.parse(raw);
      const callback = message.id && this.callbacks.get(message.id);
      if (!callback) continue;
      this.callbacks.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else callback.resolve(message.result ?? {});
    }
  }
}

const MESSAGING = `
  globalThis.__smoke ??= (() => {
    const call = (message, request, answerOnly) => new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });
      const id = message + '.' + Date.now() + '.' + Math.random();
      port.onDisconnect.addListener(() => reject(new Error('Wallet port closed')));
      port.onMessage.addListener((data) => {
        if (data.id !== id) return;
        if (data.error) { port.disconnect(); reject(new Error(data.error)); return; }
        const pushed = 'subscription' in data && data.subscription !== undefined;
        if (answerOnly && pushed) return;
        port.disconnect();
        resolve(pushed ? data.subscription : data.response);
      });
      port.postMessage({ id, message, request: request ?? null });
    });
    return { call, read: (message, request) => call(message, request, true) };
  })();
  true;
`;

describe('IrohaConnect in the built extension against live Taira', () => {
  it('runs only with an extension build and Chrome for Testing', () => {
    expect(typeof enabled).toBe('boolean');
  });

  liveTest(
    'pairs from the IrohaConnect page and signs only what the person approves',
    async () => {
      const reportDir = env.FEARLESS_IROHA_CONNECT_REPORT_DIR ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'iroha-connect-smoke-')));
      await fs.mkdir(reportDir, { recursive: true });
      const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-iroha-connect-profile-'));
      const chrome = spawn(
        chromeBinary!,
        [
          '--headless=new',
          '--enable-unsafe-extension-debugging',
          '--remote-debugging-pipe',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-sync',
          '--no-default-browser-check',
          '--no-first-run',
          '--password-store=basic',
          `--user-data-dir=${userDataDir}`,
          'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }
      );
      const cdp = new Cdp(chrome);
      const report: Record<string, unknown> = { extensionDir, startedAt: new Date().toISOString(), steps: [] };
      const step = (name: string, detail: Record<string, unknown> = {}) =>
        (report.steps as unknown[]).push({ name, at: new Date().toISOString(), ...detail });
      let app: ReturnType<typeof createConnectAppSession> | undefined;

      const evaluate = async (sessionId: string, expression: string) => {
        const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluation failed');
        }
        return result.result?.value;
      };
      const call = (sessionId: string, message: string, request?: unknown) =>
        evaluate(sessionId, `__smoke.call(${JSON.stringify(message)}, ${JSON.stringify(request ?? null)})`);
      const read = (sessionId: string, message: string) => evaluate(sessionId, `__smoke.read(${JSON.stringify(message)}, null)`);
      const capture = async (sessionId: string, name: string) => {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await fs.writeFile(path.join(reportDir, name), Buffer.from(data, 'base64'));
      };
      const click = async (sessionId: string, selector: string, description: string) => {
        const point = await eventually(
          () =>
            evaluate(
              sessionId,
              `(() => {
                const element = document.querySelector(${JSON.stringify(selector)});
                if (!element || element.disabled) return null;
                element.scrollIntoView({ block: 'center' });
                const { x, y, width, height } = element.getBoundingClientRect();
                const top = document.elementFromPoint(x + width / 2, y + height / 2);
                return top && element.contains(top) ? { x: x + width / 2, y: y + height / 2 } : null;
              })()`
            ),
          description,
          60_000
        );
        await sleep(300);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 }, sessionId);
        }
      };
      const pageText = (sessionId: string) => evaluate(sessionId, 'document.body.innerText');

      try {
        report.chrome = (await cdp.send('Browser.getVersion')).product;
        const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
        const url = `chrome-extension://${extensionId}/popup.html`;
        const { targetId } = await cdp.send('Target.createTarget', { url });
        const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Runtime.enable', {}, page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 561, height: 600, deviceScaleFactor: 1, mobile: false }, page);
        await eventually(() => evaluate(page, `document.readyState === 'complete'`), 'the wallet page');
        await evaluate(page, MESSAGING);
        await eventually(() => call(page, 'pri(app.isReady)'), 'the background');

        // A fresh universal wallet, created the way the popup does.
        await call(page, 'pri(keyring.changePassword)', { newPassword: PASSWORD, oldPassword: '' });
        const mnemonic = await call(page, 'pri(keyring.generateMnemonic)', { walletEcosystem: 'substrate', wordCount: 24 });
        const fields = { ...deriveUniversalWalletKeyringFields(mnemonic), ethereumAddress: HDNodeWallet.fromPhrase(mnemonic).address };
        const meta = { ...fields, name: 'IrohaConnect smoke', whenCreated: Date.now() };
        const ethereumAddress = await call(page, 'pri(accounts.create)', {
          meta: { ...meta, ethereumAddress: '' },
          suri: `${mnemonic}/m/44'/60'/0'/0/0`,
          type: 'ethereum',
          walletEcosystem: 'substrate',
          requireFreshGeneration: true,
        });
        const address = await call(page, 'pri(accounts.create)', {
          meta: { ...meta, ethereumAddress },
          suri: mnemonic,
          type: 'sr25519',
          walletEcosystem: 'substrate',
          requireFreshGeneration: true,
        });
        await call(page, 'pri(onboarding.setComplete)');
        await call(page, 'pri(accounts.update.current)', { address, walletEcosystem: 'substrate' });
        expect(await call(page, 'pri(keyring.unlock)', { password: PASSWORD })).toBe(true);
        const irohaPublicKeyHex = String(fields.irohaPublicKeyHex).replace(/^0x/u, '').toLowerCase();
        const accountId = encodeIrohaI105Address(irohaPublicKeyHex, 'taira');
        step('wallet created', { accountId });

        // The dApp registers its session on Taira, exactly as @iroha/connect-widget does.
        const networkId = NetworkId.parse(TAIRA.networkId!);
        const preview = createConnectSessionPreview({ networkId, node: TAIRA.toriiBaseUrl });
        const session = await registerConnectSession(TAIRA.toriiBaseUrl, preview, { node: TAIRA.toriiBaseUrl });
        app = createConnectAppSession({
          baseUrl: TAIRA.toriiBaseUrl,
          preview,
          session,
          webSocketImpl: WebSocket,
          appMeta: { name: 'Fearless smoke dApp', url: 'https://fearlesswallet.io' },
          permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: ['iroha:torii:canonical-request:v1'] },
        } as never);
        const approval = app.waitForApproval();
        approval.catch(() => undefined);
        step('dApp registered', { sid: session.sid });

        // The person pastes the link on the IrohaConnect page and starts the connection.
        await evaluate(page, `location.hash = '#/fearless/settings/iroha-connect'; true`);
        await eventually(() => evaluate(page, `!!document.querySelector('[data-testid="iroha-connect-uri"]')`), 'the IrohaConnect page');
        await evaluate(
          page,
          `(() => {
            const field = document.querySelector('[data-testid="iroha-connect-uri"]');
            field.value = ${JSON.stringify(session.wallet_uri.replace(/^iroha:/u, 'irohaconnect:'))};
            field.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`
        );
        await click(page, '[data-testid="iroha-connect-start"]', 'the Connect wallet button');
        await eventually(() => evaluate(page, `!!document.querySelector('[data-testid="iroha-connect-approve-session"]')`), 'the connection review', 30_000);
        const sessionText = await pageText(page);
        expect(sessionText).toContain('Fearless smoke dApp');
        expect(sessionText).toContain('fearlesswallet.io');
        expect(sessionText).toContain('Ask to sign messages (Fearless declines)');
        await capture(page, '01-connection-review.png');
        await click(page, '[data-testid="iroha-connect-approve-session"]', 'the Approve connection button');
        const approved = await approval;
        expect(approved.accountId).toBe(accountId);
        step('connection approved in the page; the dApp verified the approval', { accountId: approved.accountId });

        // A transfer: decoded on the page, signed only after the person approves it.
        const transfer = new Uint8Array(
          buildBrowserTransferPayload({
            networkId,
            networkPrefix: TAIRA.networkPrefix,
            authority: accountId,
            sourceAssetHoldingId: `${XOR}#${accountId}`,
            quantity: '0.001',
            destinationAccountId: encodeIrohaI105Address(
              Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(0x0b))).toString('hex'),
              'taira'
            ),
            feePayment: { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: XOR, maxAmount: '0.1' }], gasLimit: null },
            metadata: { memo: 'IrohaConnect smoke' },
            ttlMs: 100_000,
          } as never)
        );
        const transferSignature = app.signTransaction(transfer);
        await eventually(
          () => evaluate(page, `document.querySelector('[data-testid="iroha-connect-request-title"]')?.innerText`),
          'the transfer review',
          30_000
        );
        expect(await evaluate(page, `document.querySelector('[data-testid="iroha-connect-request-title"]').innerText`)).toBe('Send 0.001 XOR');
        expect(await pageText(page)).toContain('IrohaConnect smoke');
        await capture(page, '02-transfer-review.png');
        await click(page, '[data-testid="iroha-connect-approve-request"]', 'the Approve and sign button');
        const signature = await transferSignature;
        const hash = Buffer.from(browserTransactionPayloadHashHex(transfer, TAIRA.networkPrefix), 'hex');
        expect(ed25519.verify(signature, hash, irohaPublicKeyHex)).toBe(true);
        step('transfer reviewed and signed', { payloadHash: hash.toString('hex') });

        // Two keepalive intervals with nothing else on the wire: the session and the worker stay up.
        await sleep(45_000);
        expect((await read(page, 'pri(irohaConnect.subscribe)')).phase).toBe('connected');
        step('session survived 45 s of keepalive');

        const call1 = new Uint8Array(
          buildBrowserExecutableBatchPayload({
            networkId,
            networkPrefix: TAIRA.networkPrefix,
            authority: accountId,
            entries: [
              {
                kind: 'contractCall',
                contractAddress: CONTRACT,
                expectedCodeHash: `${'ab'.repeat(31)}a1`,
                entrypoint: 'place_order',
                arguments: Uint8Array.of(1, 2, 3),
              },
            ],
            feePayment: { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: XOR, maxAmount: '0.1' }], gasLimit: '50000' },
            ttlMs: 100_000,
          } as never)
        );
        const callSignature = app.signTransaction(call1);
        await eventually(
          () => evaluate(page, `document.querySelector('[data-testid="iroha-connect-request-title"]')?.innerText === 'Call place_order'`),
          'the contract-call review',
          30_000
        );
        await capture(page, '03-contract-call-review.png');
        await click(page, '[data-testid="iroha-connect-approve-request"]', 'the Approve and sign button');
        expect(await callSignature).toHaveLength(64);
        step('contract call reviewed and signed');

        await expect(app.signRaw('iroha:torii:canonical-request:v1', Uint8Array.of(1, 2, 3))).rejects.toMatchObject({
          code: 'SIGNING_KEY_REQUIRED',
        });
        const notice = await eventually(
          () => evaluate(page, `document.querySelector('[data-testid="iroha-connect-notice"]')?.innerText`),
          'the declined-message notice',
          20_000
        );
        expect(notice).toContain('Fearless declined');
        await capture(page, '04-raw-request-declined.png');
        step('raw request declined with a notice', { notice });

        // Disconnect from the page: the dApp's session ends.
        const closed = app.signTransaction(transfer).then(
          () => 'signed',
          (error: Error) => error.name
        );
        await eventually(() => evaluate(page, `!!document.querySelector('[data-testid="iroha-connect-request-title"]')`), 'a third review', 30_000);
        await evaluate(page, `[...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Reject')?.click(); true`);
        await eventually(() => evaluate(page, `[...document.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Disconnect')`), 'the connected state');
        await evaluate(page, `[...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Disconnect').click(); true`);
        expect(await closed).toBe('ConnectSignRequestError');
        await eventually(async () => (await read(page, 'pri(irohaConnect.subscribe)')).phase === 'idle', 'the wallet to return to idle');
        await expect(app.signTransaction(transfer)).rejects.toMatchObject({ name: 'ConnectSessionClosedError' });
        step('rejected the third request, then disconnected; the dApp session ended');
        report.result = 'passed';
      } catch (error) {
        report.result = 'failed';
        report.failure = (error as Error).message;
        throw error;
      } finally {
        app?.close('smoke cleanup');
        chrome.kill('SIGTERM');
        await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(10_000)]);
        if (chrome.exitCode === null) chrome.kill('SIGKILL');
        report.finishedAt = new Date().toISOString();
        await fs.writeFile(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        await fs.rm(userDataDir, { recursive: true, force: true });
      }
    },
    300_000
  );
});
