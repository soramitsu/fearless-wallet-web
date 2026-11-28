import { beforeEach, describe, expect, it, vi } from 'vitest';

const phishing = vi.hoisted(() => ({ denied: vi.fn(async () => false) }));

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: phishing.denied }));

import { Address, Cell, beginCell, contractAddress, loadMessage, loadMessageRelaxed, loadStateInit } from '@ton/core';
import { keyPairFromSeed, signVerify } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { TonConnectService, type TonConnectEvent } from '@extension-base/services/ton-connect-service';
import TonRequestHandler from '@extension-base/services/request-service/handlers/TonRequestHandler';
import type { TonConnectSessionsRecord } from '@extension-base/services/ton-connect-service/store';
import { DappSigningPausedError } from '@/util/dappSigningKillSwitch';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';
import { signDataSigningHash, tonProofSigningHash } from '@/util/tonConnect/protocol';

const NOW = 1_800_000_000;
const ORIGIN = 'https://app.example';
const keyPair = keyPairFromSeed(Buffer.alloc(32, 3));
const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
const ADDRESS = wallet.address.toString();
const RECIPIENT = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
const manifest = { url: ORIGIN, name: 'Example dApp', iconUrl: `${ORIGIN}/icon.png` };

type Item = Record<string, unknown> & { name: string };

function memoryStore() {
  let record: TonConnectSessionsRecord = { version: 1, sessions: {} };

  return {
    readSessions: async () => structuredClone(record),
    mutateSessions: async (change: (record: TonConnectSessionsRecord) => void) => {
      const next = structuredClone(record);

      change(next);
      record = next;

      return structuredClone(record);
    },
  };
}

function setup(options: { signingAllowed?: boolean; deployed?: boolean } = {}) {
  const sent: Cell[] = [];
  const provider = {
    getWalletState: vi.fn(async () => ({ seqno: 7, deployed: options.deployed ?? false })),
    sendMessage: vi.fn(async (cell: Cell) => {
      sent.push(cell);
    }),
  };
  const tonAccounts: Record<string, unknown> = {
    [ADDRESS]: { address: ADDRESS, name: 'TON one', publicKey: keyPair.publicKey, walletContract: wallet },
  };
  const requestService: Record<string, unknown> = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    hasSigningRequest: () => false,
  };
  const state = {
    currentAccount: { address: ADDRESS },
    dappSigningKillSwitchService: { isSigningAllowed: async () => options.signingAllowed ?? true },
    keyringService: {
      keyringIsLocked: false,
      isResetting: false,
      walletResetRevision: 0,
      walletAuthenticationRevision: 0,
      getAllAccounts: () => [],
      tonKeyring: {
        getAccounts: () =>
          Object.keys(tonAccounts).map((address) => ({
            address,
            walletEcosystem: 'ton',
            meta: { name: 'TON one', walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION },
          })),
        accountSubject: {
          get value() {
            return tonAccounts;
          },
        },
        decodeMnemonicVerified: vi.fn(async () => Array(24).fill('word').join(' ')),
        mnemonicToKeyPair: vi.fn(async () => ({ publicKey: keyPair.publicKey, secretKey: Buffer.from(keyPair.secretKey) })),
      },
    },
    networkService: { networkValues: [{ name: 'TON Mainnet' }], tonApiHandler: { initApi: vi.fn() } },
    getTonApiMap: { 'ton mainnet': { api: { broadcaster: async () => provider } } },
    requestService,
  };

  requestService.tonRequestHandler = new TonRequestHandler(requestService as never);

  const service = new TonConnectService(state as never, async () => manifest, () => NOW, memoryStore());

  return { service, state, provider, sent, tonAccounts, handler: requestService.tonRequestHandler as TonRequestHandler };
}

async function connectWithProof(service: TonConnectService, origin = ORIGIN) {
  const event = service.connect(origin, 2, {
    manifestUrl: `${origin}/tonconnect-manifest.json`,
    items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'server-nonce' }],
  });

  await vi.waitFor(() => expect(service.connectRequestsSubject.value).toHaveLength(1));

  const [request] = service.connectRequestsSubject.value;

  return { event, request };
}

const items = (event: TonConnectEvent): Item[] => (event.event === 'connect' ? (event.payload.items as Item[]) : []);

describe('TON Connect service: connect', () => {
  beforeEach(() => phishing.denied.mockResolvedValue(false));

  it('asks the person, then replies with the wallet address and a proof bound to the page domain', async () => {
    const { service } = setup();
    const { event, request } = await connectWithProof(service);

    expect(request).toMatchObject({ origin: ORIGIN, proofDomain: 'app.example', manifestMatchesOrigin: true, defaultAddress: ADDRESS });
    expect(await service.approveConnect(request.id, ADDRESS)).toBe(true);

    const reply = await event;

    expect(reply.event).toBe('connect');
    if (reply.event !== 'connect') return;
    expect(reply.payload.device).toMatchObject({ appName: 'Fearless', maxProtocolVersion: 2 });

    const [address, proof] = items(reply) as [Item, Item & { proof: Record<string, unknown> }];

    expect(address).toMatchObject({ name: 'ton_addr', address: wallet.address.toRawString(), network: '-239' });
    expect(address.publicKey).toBe(Buffer.from(keyPair.publicKey).toString('hex'));

    const init = loadStateInit(Cell.fromBase64(address.walletStateInit as string).beginParse());

    expect(contractAddress(0, init).equals(wallet.address)).toBe(true);
    expect(proof.proof).toMatchObject({ timestamp: NOW, domain: { lengthBytes: 11, value: 'app.example' }, payload: 'server-nonce' });

    const hash = tonProofSigningHash({ address: wallet.address, domain: 'app.example', timestamp: NOW, payload: 'server-nonce' });

    expect(signVerify(Buffer.from(hash), Buffer.from(proof.proof.signature as string, 'base64'), keyPair.publicKey)).toBe(true);
    expect(service.connectRequestsSubject.value).toHaveLength(0);
  });

  it('restores a connected page with only its address and refuses an unknown one with code 100', async () => {
    const { service } = setup();
    const { event, request } = await connectWithProof(service);

    await service.approveConnect(request.id, ADDRESS);
    await event;

    const restored = await service.restoreConnection(ORIGIN);

    expect(items(restored).map(({ name }) => name)).toEqual(['ton_addr']);
    expect(await service.restoreConnection('https://other.example')).toMatchObject({ event: 'connect_error', payload: { code: 100 } });
  });

  it('reconnects a connected page without a prompt unless it asks for a new proof', async () => {
    const { service } = setup();
    const first = await connectWithProof(service);

    await service.approveConnect(first.request.id, ADDRESS);
    await first.event;

    const silent = await service.connect(ORIGIN, 2, { manifestUrl: `${ORIGIN}/m.json`, items: [{ name: 'ton_addr' }] });

    expect(silent.event).toBe('connect');
    expect(service.connectRequestsSubject.value).toHaveLength(0);

    const again = await connectWithProof(service);

    expect(again.request.proofDomain).toBe('app.example');
    service.rejectConnect(again.request.id);
    expect(await again.event).toMatchObject({ event: 'connect_error', payload: { code: 300 } });
  });

  it('answers a declined prompt with code 300 and an unsupported item with a per-item error', async () => {
    const { service } = setup();
    const declined = await connectWithProof(service);

    expect(service.rejectConnect(declined.request.id)).toBe(true);
    expect(await declined.event).toMatchObject({ event: 'connect_error', payload: { code: 300 } });

    const pending = service.connect(ORIGIN, 2, {
      manifestUrl: `${ORIGIN}/m.json`,
      items: [{ name: 'ton_addr' }, { name: 'future_item' }],
    });

    await vi.waitFor(() => expect(service.connectRequestsSubject.value).toHaveLength(1));
    await service.approveConnect(service.connectRequestsSubject.value[0].id, ADDRESS);
    expect(items(await pending)[1]).toEqual({ name: 'future_item', error: { code: 400, message: expect.any(String) } });
  });

  it.each([
    ['an insecure page', 'http://app.example', { manifestUrl: 'https://a.b/m.json', items: [{ name: 'ton_addr' }] }, 1],
    ['a proof for a name without a dot', 'http://localhost:5173', { manifestUrl: 'https://a.b/m.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'x' }] }, 1],
    ['a request without an address', ORIGIN, { manifestUrl: 'https://a.b/m.json', items: [{ name: 'ton_proof', payload: 'x' }] }, 1],
  ])('refuses %s before any prompt', async (_, origin, request, code) => {
    const { service } = setup();

    expect(await service.connect(origin, 2, request)).toMatchObject({ event: 'connect_error', payload: { code } });
    expect(service.connectRequestsSubject.value).toHaveLength(0);
  });

  it('ends a prompt as declined when the page closes', async () => {
    const { service } = setup();
    const controller = new AbortController();
    const event = service.connect(ORIGIN, 2, { manifestUrl: `${ORIGIN}/m.json`, items: [{ name: 'ton_addr' }] }, controller.signal);

    await vi.waitFor(() => expect(service.connectRequestsSubject.value).toHaveLength(1));
    controller.abort();
    expect(await event).toMatchObject({ event: 'connect_error', payload: { code: 300 } });
  });

  it('signs no proof while TON dApp signing is paused, and a flagged site gets no connection', async () => {
    const paused = setup({ signingAllowed: false });
    const pausedConnect = await connectWithProof(paused.service);

    await expect(paused.service.approveConnect(pausedConnect.request.id, ADDRESS)).rejects.toBeInstanceOf(DappSigningPausedError);
    expect(await pausedConnect.event).toMatchObject({ event: 'connect_error', payload: { code: 300 } });
    expect(paused.state.keyringService.tonKeyring.decodeMnemonicVerified).not.toHaveBeenCalled();

    phishing.denied.mockResolvedValue(true);

    const flagged = setup();
    const flaggedConnect = await connectWithProof(flagged.service);

    expect(await flagged.service.approveConnect(flaggedConnect.request.id, ADDRESS)).toBe(false);
    expect(await flaggedConnect.event).toMatchObject({ event: 'connect_error' });
    expect(await flagged.service.restoreConnection(ORIGIN)).toMatchObject({ event: 'connect_error', payload: { code: 100 } });
  });
});

describe('TON Connect service: requests', () => {
  beforeEach(() => phishing.denied.mockResolvedValue(false));

  async function connected(options?: Parameters<typeof setup>[0]) {
    const context = setup(options);
    const pending = context.service.connect(ORIGIN, 2, { manifestUrl: `${ORIGIN}/m.json`, items: [{ name: 'ton_addr' }] });

    await vi.waitFor(() => expect(context.service.connectRequestsSubject.value).toHaveLength(1));
    await context.service.approveConnect(context.service.connectRequestsSubject.value[0].id, ADDRESS);
    await pending;

    return context;
  }

  async function approveQueued(context: Awaited<ReturnType<typeof connected>>) {
    await vi.waitFor(() => expect(Object.keys(context.handler.signTonSubject.value)).toHaveLength(1));

    const [id] = Object.keys(context.handler.signTonSubject.value);
    const queued = context.handler.getTonSignRequest(id)!;

    queued.resolve(await context.service.approveSigning(queued, () => undefined));

    return context.handler.signTonSubject;
  }

  it('signs and sends a reviewed transaction with send mode 3, expiring at valid_until', async () => {
    const context = await connected();
    const destination = RECIPIENT.toString({ bounceable: false, urlSafe: true });
    const comment = beginCell().storeUint(0, 32).storeStringTail('gm').endCell().toBoc().toString('base64');
    const response = context.service.send(ORIGIN, {
      id: '0',
      method: 'sendTransaction',
      params: [JSON.stringify({ valid_until: NOW + 120, network: '-239', messages: [{ address: destination, amount: '1500000000', payload: comment }] })],
    });

    await vi.waitFor(() => expect(Object.keys(context.handler.signTonSubject.value)).toHaveLength(1));

    const [shown] = Object.values(context.handler.signTonSubject.value);

    expect(shown).toMatchObject({
      method: 'sendTransaction',
      url: ORIGIN,
      appName: 'Example dApp',
      validUntil: NOW + 120,
      messages: [{ to: destination, bounce: false, amount: '1500000000', kind: 'comment', comment: 'gm' }],
    });
    expect(shown).not.toHaveProperty('transaction');

    await approveQueued(context);

    const reply = await response;

    expect(reply).toEqual({ id: '0', result: context.sent[0].toBoc().toString('base64') });

    const external = loadMessage(context.sent[0].beginParse());

    expect(external.info.type).toBe('external-in');
    expect(external.info.dest?.toString()).toBe(wallet.address.toString());
    expect(external.init).toBeTruthy();

    const body = external.body.beginParse();
    const signature = body.loadBuffer(64);
    const signed = body.asCell();

    expect(signVerify(signed.hash(), signature, keyPair.publicKey)).toBe(true);
    expect(body.loadUint(32)).toBe(wallet.walletId);
    expect(body.loadUint(32)).toBe(NOW + 120);
    expect(body.loadUint(32)).toBe(7);
    expect(body.loadUint(8)).toBe(0);
    expect(body.loadUint(8)).toBe(3);

    const internal = loadMessageRelaxed(body.loadRef().beginParse());

    expect(internal.info.type).toBe('internal');
    if (internal.info.type !== 'internal') return;
    expect(internal.info.dest.equals(RECIPIENT)).toBe(true);
    expect(internal.info.value.coins).toBe(1_500_000_000n);
    expect(internal.info.bounce).toBe(false);
  });

  it('sends no state init from a deployed wallet', async () => {
    const context = await connected({ deployed: true });
    const response = context.service.send(ORIGIN, {
      id: '1',
      method: 'sendTransaction',
      params: [JSON.stringify({ messages: [{ address: RECIPIENT.toString(), amount: '1' }] })],
    });

    await approveQueued(context);
    await response;
    expect(loadMessage(context.sent[0].beginParse()).init).toBeFalsy();
  });

  it('signs text with the page domain as the reference verifier expects', async () => {
    const context = await connected();
    const response = context.service.send(ORIGIN, {
      id: '3',
      method: 'signData',
      params: [JSON.stringify({ type: 'text', text: 'Log in to Example', network: '-239' })],
    });

    await approveQueued(context);

    const reply = (await response) as { id: string; result: Record<string, unknown> };

    expect(reply.result).toMatchObject({
      address: wallet.address.toRawString(),
      domain: 'app.example',
      timestamp: NOW,
      payload: { type: 'text', text: 'Log in to Example', network: '-239' },
    });

    const hash = signDataSigningHash({ address: wallet.address, domain: 'app.example', timestamp: NOW, data: { type: 'text', text: 'Log in to Example' } });

    expect(signVerify(Buffer.from(hash), Buffer.from(reply.result.signature as string, 'base64'), keyPair.publicKey)).toBe(true);
  });

  it('answers a rejected request with code 300 and refuses a request id that does not rise', async () => {
    const context = await connected();
    const response = context.service.send(ORIGIN, {
      id: '5',
      method: 'signData',
      params: [JSON.stringify({ type: 'text', text: 'x' })],
    });

    await vi.waitFor(() => expect(Object.keys(context.handler.signTonSubject.value)).toHaveLength(1));
    context.handler.getTonSignRequest(Object.keys(context.handler.signTonSubject.value)[0])!.reject(new Error('Cancelled'));
    expect(await response).toMatchObject({ id: '5', error: { code: 300 } });
    expect(await context.service.send(ORIGIN, { id: '5', method: 'disconnect', params: [] })).toMatchObject({ id: '5', error: { code: 1 } });
    expect(await context.service.send(ORIGIN, { id: '6', method: 'signMessage', params: ['{}'] })).toMatchObject({ id: '6', error: { code: 400 } });
  });

  it('answers a page that is not connected with code 100', async () => {
    const { service } = setup();

    expect(await service.send(ORIGIN, { id: '1', method: 'sendTransaction', params: ['{}'] })).toMatchObject({ id: '1', error: { code: 100 } });
  });

  it('ends the session on the page’s disconnect without an event back to it', async () => {
    const context = await connected();
    const events: TonConnectEvent[] = [];

    context.service.subscribe(ORIGIN, true, (event) => events.push(event));
    expect(await context.service.send(ORIGIN, { id: '9', method: 'disconnect', params: [] })).toEqual({ id: '9', result: {} });
    expect(await context.service.restoreConnection(ORIGIN)).toMatchObject({ event: 'connect_error', payload: { code: 100 } });
    expect(events).toEqual([]);
  });

  it('tells the page when the person disconnects it or removes its wallet', async () => {
    const context = await connected();
    const events: TonConnectEvent[] = [];

    context.service.subscribe(ORIGIN, true, (event) => events.push(event));
    await context.service.disconnectSession(ORIGIN);
    expect(events.map(({ event }) => event)).toEqual(['disconnect']);

    const removed = await connected();
    const removedEvents: TonConnectEvent[] = [];

    removed.service.subscribe(ORIGIN, true, (event) => removedEvents.push(event));
    delete removed.tonAccounts[ADDRESS];
    await removed.service.forgetAddress(ADDRESS);
    expect(removedEvents.map(({ event }) => event)).toEqual(['disconnect']);
    expect(await removed.service.send(ORIGIN, { id: '1', method: 'disconnect', params: [] })).toMatchObject({ error: { code: 100 } });
  });

  it('tells a page that still believes it is connected that its session ended while it could not hear', async () => {
    const { service } = setup();
    const events: TonConnectEvent[] = [];

    service.subscribe(ORIGIN, true, (event) => events.push(event));
    await vi.waitFor(() => expect(events.map(({ event }) => event)).toEqual(['disconnect']));
  });

  it('refuses a transaction for another network before it reaches the review', async () => {
    const context = await connected();

    expect(
      await context.service.send(ORIGIN, {
        id: '2',
        method: 'sendTransaction',
        params: [JSON.stringify({ network: '-3', messages: [{ address: RECIPIENT.toString(), amount: '1' }] })],
      })
    ).toMatchObject({ error: { code: 1 } });
    expect(Object.keys(context.handler.signTonSubject.value)).toHaveLength(0);
  });
});
