// @vitest-environment node
import { writeFileSync } from 'node:fs';

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

import { IROHA_CONNECT_PROFILES, IrohaConnectService } from '@extension-base/services/iroha-connect-service';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

// Live pairing against the deployed Taira Torii relay: the upstream app SDK registers and opens a session, the
// wallet service joins it with the registered wallet link, approves, reviews and signs a transfer and a contract
// call, refuses a raw request, and keeps the session alive across Connect pings. Nothing is submitted to the chain.
// Opt in with FEARLESS_IROHA_CONNECT_LIVE=1 (optional FEARLESS_IROHA_CONNECT_EVIDENCE=<path>).

const TAIRA = IROHA_CONNECT_PROFILES.taira;
const XOR = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id;
const TEST_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const CONTRACT = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';

const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env ?? {};
const live = env.FEARLESS_IROHA_CONNECT_LIVE === '1';
const liveTest = live ? it : it.skip;

const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 20_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe('IrohaConnect live Taira relay', () => {
  it('stays off unless explicitly enabled', () => {
    expect(['1', undefined]).toContain(env.FEARLESS_IROHA_CONNECT_LIVE);
  });

  liveTest(
    'pairs, reviews, signs and survives keepalives on taira.sora.org',
    async () => {
      const evidence: Record<string, unknown> = { torii: TAIRA.toriiBaseUrl, startedAt: new Date().toISOString() };
      const derived = deriveIrohaSigningKey({ mnemonic: TEST_MNEMONIC });
      const accountId = encodeIrohaI105Address(derived.publicKeyHex, 'taira');
      const destination = encodeIrohaI105Address(
        Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(0x0b))).toString('hex'),
        'taira'
      );
      const storedAccount = {
        address: 'live-iroha-account',
        meta: {
          irohaPublicKeyHex: derived.publicKeyHex,
          name: 'Live smoke',
          walletEcosystem: WalletEcosystem.Iroha,
          walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION,
        },
      };
      const keyringService = {
        accountSubject: { value: { primary: { json: storedAccount, type: 'ed25519' } } },
        addressSubject: { value: {} },
        exportMnemonic: () => ({ seed: TEST_MNEMONIC }),
        getAccounts: () => [storedAccount],
        keyringIsLocked: false,
      };
      const events: string[] = [];
      const started = Date.now();
      const stamp = () => `${((Date.now() - started) / 1000).toFixed(2)}s`;
      evidence.events = events;
      const wallet = new IrohaConnectService({ keyringService } as never, {
        onStateChange: (next) =>
          events.push(`${stamp()} ${next.phase}${next.notice ? ` notice=${next.notice.code}` : ''}${next.error ? ` error=${next.error}` : ''}`),
        createSocket: (url, protocols) => {
          const socket = new WebSocket(url, protocols);
          socket.addEventListener('message', (event) => events.push(`${stamp()} relay frame ${(event.data as ArrayBuffer).byteLength} bytes`));
          socket.addEventListener('close', (event) => events.push(`${stamp()} relay socket closed ${event.code}`));
          return socket as never;
        },
      });

      const networkId = NetworkId.parse(TAIRA.networkId!);
      const preview = createConnectSessionPreview({ networkId, node: TAIRA.toriiBaseUrl });
      const session = await registerConnectSession(TAIRA.toriiBaseUrl, preview, { node: TAIRA.toriiBaseUrl });
      evidence.sid = session.sid;
      const app = createConnectAppSession({
        baseUrl: TAIRA.toriiBaseUrl,
        preview,
        session,
        webSocketImpl: WebSocket,
        appMeta: { name: 'Fearless live smoke', url: 'https://fearlesswallet.io' },
        permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: ['iroha:torii:canonical-request:v1'] },
      } as never);
      const approval = app.waitForApproval();
      approval.catch(() => undefined);

      try {
        wallet.connect(session.wallet_uri);
        await waitFor(() => wallet.snapshot.phase === 'session-approval', 'the relayed Open frame');
        expect(wallet.snapshot.session).toMatchObject({ appName: 'Fearless live smoke', networkId: TAIRA.networkId });

        await wallet.approveSession(accountId);
        const approved = await approval;
        expect(approved.accountId).toBe(accountId);
        evidence.approvedAccount = accountId;

        const transfer = new Uint8Array(
          buildBrowserTransferPayload({
            networkId,
            networkPrefix: TAIRA.networkPrefix,
            authority: accountId,
            sourceAssetHoldingId: `${XOR}#${accountId}`,
            quantity: '0.001',
            destinationAccountId: destination,
            feePayment: {
              payer: 'authority',
              chargeLimits: [{ kind: 'nexus', assetDefinitionId: XOR, maxAmount: '0.1' }],
              gasLimit: null,
            },
            ttlMs: 100_000,
          } as never)
        );
        const transferSignature = app.signTransaction(transfer);
        await waitFor(() => wallet.snapshot.phase === 'request-approval', 'the transfer review');
        expect(wallet.snapshot.request?.review).toMatchObject({
          kind: 'transfer',
          transfer: { quantity: '0.001', destination },
        });
        wallet.approveRequest(wallet.snapshot.request!.requestId);
        const signature = await transferSignature;
        const hash = Buffer.from(browserTransactionPayloadHashHex(transfer, TAIRA.networkPrefix), 'hex');
        expect(ed25519.verify(signature, hash, derived.publicKeyHex)).toBe(true);
        evidence.transferPayloadHash = hash.toString('hex');

        // Two keepalive intervals: Torii must relay the wallet's Connect pings and the app SDK must answer them.
        await new Promise((resolve) => setTimeout(resolve, 45_000));
        expect(wallet.snapshot.phase).toBe('connected');

        const call = new Uint8Array(
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
            feePayment: {
              payer: 'authority',
              chargeLimits: [{ kind: 'nexus', assetDefinitionId: XOR, maxAmount: '0.1' }],
              gasLimit: '50000',
            },
            ttlMs: 100_000,
          } as never)
        );
        const callSignature = app.signTransaction(call);
        await waitFor(() => wallet.snapshot.phase === 'request-approval', 'the contract-call review');
        expect(wallet.snapshot.request?.review.calls?.[0]).toMatchObject({ entrypoint: 'place_order', argumentBytes: 3 });
        wallet.approveRequest(wallet.snapshot.request!.requestId);
        expect(await callSignature).toHaveLength(64);

        const raw = app.signRaw('iroha:torii:canonical-request:v1', Uint8Array.of(1, 2, 3));
        await expect(raw).rejects.toMatchObject({ code: 'SIGNING_KEY_REQUIRED' });

        events.push(`${stamp()} app closes the session`);
        app.close('live smoke done');
        await waitFor(() => wallet.snapshot.phase === 'idle', `the app close (${events.slice(-6).join(' | ')})`);
        expect(wallet.snapshot.notice?.code).toBe('dapp_closed');
        evidence.result = 'passed';
      } finally {
        evidence.finishedAt = new Date().toISOString();
        app.close('live smoke cleanup');
        wallet.disconnect();
        if (env.FEARLESS_IROHA_CONNECT_EVIDENCE) {
          writeFileSync(env.FEARLESS_IROHA_CONNECT_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
        }
      }
    },
    120_000
  );
});
