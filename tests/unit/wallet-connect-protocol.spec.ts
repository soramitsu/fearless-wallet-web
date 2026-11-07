import { ed25519 } from '@noble/curves/ed25519';
import { base64urlnopad } from '@scure/base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletConnectClient } from '@extension-base/services/wallet-connect-service/protocol/client';
import {
  decodeEnvelope,
  decrypt,
  deriveSymKey,
  encrypt,
  generateKeyPair,
  hashMessage,
  randomKey,
  relayAuthToken,
  relayClientId,
  topicOf,
} from '@extension-base/services/wallet-connect-service/protocol/crypto';
import { getInternalError, getSdkError } from '@extension-base/services/wallet-connect-service/protocol/errors';
import { WALLET_CONNECT_RECORD, SDK_KEYCHAIN, SDK_SESSIONS } from '@extension-base/services/wallet-connect-service/protocol/store';
import { formatPairingUri, parsePairingUri } from '@extension-base/services/wallet-connect-service/protocol/uri';
import { VerifyClient } from '@extension-base/services/wallet-connect-service/protocol/verify';
import { formatJsonRpcRequest, formatJsonRpcResult } from '@extension-base/utils/jsonRpc';
import { FakeWalletConnectRelay, memoryStorage, offlineVerify } from './helpers/walletConnectRelay';
import type { WalletConnectRecord } from '@extension-base/services/wallet-connect-service/protocol/store';
import type { WcEvent, WcEvents } from '@extension-base/services/wallet-connect-service/protocol/types';

// Public fixtures only: no live relay, no network, no real accounts.
const EVM = `0x${'11'.repeat(20)}`;
const EVM_TWO = `0x${'22'.repeat(20)}`;
const DOT = 'polkadot:91b171bb158e2d3848fa23a9f1c25182';
const SUBSTRATE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const PROPOSAL = { optionalNamespaces: { eip155: { chains: ['eip155:1'], methods: ['personal_sign'], events: ['chainChanged'] } } };
const GRANT = { eip155: { chains: ['eip155:1'], accounts: [`eip155:1:${EVM}`], methods: ['personal_sign'], events: ['chainChanged'] } };

let relay: FakeWalletConnectRelay;
const open: WalletConnectClient[] = [];

afterEach(() => {
  for (const client of open.splice(0)) client.close();
  vi.useRealTimers();
});

async function client(name: string, storage = memoryStorage(), url = `https://${name.toLowerCase().replace(/\W+/g, '-')}.example`) {
  relay ??= new FakeWalletConnectRelay();
  const instance = await WalletConnectClient.init({
    projectId: 'public-test-project',
    relayUrl: 'wss://relay.test',
    metadata: { name, description: '', url, icons: [] },
    storage,
    createSocket: relay.createSocket,
    fetch: offlineVerify,
  });

  open.push(instance);

  return instance;
}

function once<E extends WcEvent>(target: WalletConnectClient, event: E): Promise<WcEvents[E]> {
  return new Promise((resolve) => {
    const listener = (value: WcEvents[E]) => {
      target.off(event, listener);
      resolve(value);
    };

    target.on(event, listener);
  });
}

/** A dApp (an in-repo client in the dApp role) with a settled session with `wallet`. */
async function settled(wallet: WalletConnectClient, dapp: WalletConnectClient, grant = GRANT) {
  const { uri, approval } = await dapp.connect(PROPOSAL);
  const proposal = once(wallet, 'session_proposal');

  await wallet.pair({ uri });
  const { id } = await proposal;
  const approved = await wallet.approve({ id, namespaces: grant });
  const session = await approval();

  await approved.acknowledged();

  return { topic: approved.topic, session };
}

/** Publishes a request on a topic as some other relay client would. */
function inject(topic: string, symKey: string, payload: unknown) {
  const socket = relay.createSocket('wss://relay.test?auth=injector');

  return new Promise<void>((resolve) => {
    socket.onopen = () => {
      socket.send(JSON.stringify(formatJsonRpcRequest('irn_publish', { topic, message: encrypt({ symKey, message: JSON.stringify(payload) }), ttl: 300, tag: 0 })));
      setTimeout(resolve, 20);
    };
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const PEER = { name: 'Public peer', description: '', url: 'https://peer.example', icons: [] };
const DOT_GRANT = { polkadot: { chains: [DOT], accounts: [`${DOT}:${SUBSTRATE}`], methods: ['polkadot_signMessage'], events: [] } };

/** A session in which Fearless is the wallet, with a dApp that is only keys on the test's side. */
async function walletSessionWithKeys(wallet: WalletConnectClient) {
  const pairingTopic = randomKey();
  const pairingKey = randomKey();
  const dappKeys = generateKeyPair();

  await wallet.pair({ uri: formatPairingUri({ topic: pairingTopic, symKey: pairingKey, relay: { protocol: 'irn' } }) });
  const proposal = once(wallet, 'session_proposal');

  await inject(pairingTopic, pairingKey, formatJsonRpcRequest('wc_sessionPropose', {
    relays: [{ protocol: 'irn' }],
    proposer: { publicKey: dappKeys.publicKey, metadata: PEER },
    requiredNamespaces: {},
    optionalNamespaces: PROPOSAL.optionalNamespaces,
  }));
  const approved = await wallet.approve({ id: (await proposal).id, namespaces: GRANT });
  const symKey = memoryStorageOf(wallet).keys[approved.topic];

  await inject(approved.topic, symKey, formatJsonRpcResult(memoryStorageOf(wallet).settlements[approved.topic], true));
  await approved.acknowledged();

  return { topic: approved.topic, symKey };
}

/** A session in which Fearless is the dApp, with a phone wallet that is only keys on the test's side. */
async function dappSessionWithKeys(fearless: WalletConnectClient) {
  const { uri, approval } = await fearless.connect({ optionalNamespaces: { polkadot: { chains: [DOT], methods: ['polkadot_signMessage'], events: [] } } });
  const { topic: pairingTopic, symKey } = parsePairingUri(uri);
  const { proposal } = memoryStorageOf(fearless).sentProposals.find((sent) => sent.proposal.pairingTopic === pairingTopic)!;
  const phone = generateKeyPair();
  const sessionKey = deriveSymKey(phone.privateKey, proposal.proposer.publicKey);

  await inject(pairingTopic, symKey, formatJsonRpcResult(proposal.id, { relay: { protocol: 'irn' }, responderPublicKey: phone.publicKey }));
  await settle();
  await inject(topicOf(sessionKey), sessionKey, formatJsonRpcRequest('wc_sessionSettle', {
    relay: { protocol: 'irn' },
    namespaces: DOT_GRANT,
    expiry: Math.floor(Date.now() / 1000) + 3600,
    controller: { publicKey: phone.publicKey, metadata: PEER },
  }));
  const session = await approval();

  return { topic: session.topic, sessionKey };
}

/** The error code Fearless answered a request with on a topic, read from what it published. */
function answeredError(topic: string, symKey: string, id: number): number | undefined {
  for (const entry of relay.published.filter((published) => published.topic === topic)) {
    const payload = JSON.parse(decrypt(symKey, entry.message));

    if (payload.id === id && payload.error) return payload.error.code;
  }

  return undefined;
}

describe('WalletConnect cryptography', () => {
  it('derives the session key from X25519 (RFC 7748 keys), HKDF-SHA256 and the topic from SHA-256', () => {
    const alice = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
    const bobPublic = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
    const symKey = deriveSymKey(alice, bobPublic);

    expect(symKey).toBe('ea1d8a20f476d1e1ec952ca42708b8f7161ce7c81eadf97e520e2b40333decd5');
    expect(topicOf(symKey)).toBe('1ca1d70db64cab0f93de5934e27f7114e8e9fd7dd3c7145d81ce7f2dd2cd05c8');
    const one = generateKeyPair();
    const two = generateKeyPair();

    expect(deriveSymKey(one.privateKey, two.publicKey)).toBe(deriveSymKey(two.privateKey, one.publicKey));
  });

  it('refuses a peer key that would give the all-zero shared secret', () => {
    expect(() => deriveSymKey(generateKeyPair().privateKey, '00'.repeat(32))).toThrow();
  });

  it('seals messages in type 0 envelopes and refuses a changed byte or another key', () => {
    const symKey = randomKey();
    const message = JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'wc_sessionPing', params: { text: 'ü😀' } });
    const sealed = encrypt({ symKey, message });
    const envelope = decodeEnvelope(sealed);

    expect(envelope.type).toBe(0);
    expect(envelope.iv).toHaveLength(12);
    expect(decrypt(symKey, sealed)).toBe(message);
    // Padding is optional on the way in.
    expect(decrypt(symKey, sealed.replace(/=+$/, ''))).toBe(message);
    const bytes = Buffer.from(sealed, 'base64');

    bytes[bytes.length - 1] ^= 1;
    expect(() => decrypt(symKey, bytes.toString('base64'))).toThrow();
    expect(() => decrypt(randomKey(), sealed)).toThrow();
  });

  it('reads the sender key of a type 1 envelope, never opens one, and refuses type 2', () => {
    const sender = generateKeyPair().publicKey;
    const sealed = encrypt({ symKey: randomKey(), message: '{}', type: 1, senderPublicKey: sender });

    expect(decodeEnvelope(sealed)).toMatchObject({ type: 1, senderPublicKey: sender });
    expect(() => decrypt(randomKey(), sealed)).toThrow('Unexpected envelope type');
    expect(() => decodeEnvelope(Buffer.from([2, 123, 125]).toString('base64'))).toThrow('Unsupported envelope type');
  });

  it('signs in to the relay with an EdDSA token for its URL, from a did:key identity', () => {
    const seed = new Uint8Array(32).map((_, index) => index * 7);
    const token = relayAuthToken({ seed, audience: 'wss://relay.walletconnect.org', subject: 'sub', issuedAt: 1700000000 });

    // The bytes WalletConnect's own relay-auth produces for the same inputs.
    expect(token).toBe(
      'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6a2V5Ono2TWtqZTRWaHFxM0g3WU1vR3RhWERvaDgxS1JlV0ZQdnR3RW1RZkt1UEIyR2d4SyIsInN1YiI6InN1YiIsImF1ZCI6IndzczovL3JlbGF5LndhbGxldGNvbm5lY3Qub3JnIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwODY0MDB9.yGZUUoefzFXr5vwwmvgu5oE3g76YIYVWxAP8S8tRbajD0PcnlNhho_aveRlFxl6RX2taLIT71zdXXBWXtqsLCw'
    );
    expect(relayClientId(seed)).toBe('did:key:z6Mkje4Vhqq3H7YMoGtaXDoh81KReWFPvtwEmQfKuPB2GgxK');
    const [header, payload, signature] = token.split('.');

    expect(ed25519.verify(base64urlnopad.decode(signature), new TextEncoder().encode(`${header}.${payload}`), ed25519.getPublicKey(seed))).toBe(true);
    expect(hashMessage('{"id":1,"jsonrpc":"2.0","result":true}')).toBe('1b6640c68d669b4cdafb0b92e29e90b58c66d8aaf01c3781e5577706f67a1536');
  });
});

describe('WalletConnect pairing links', () => {
  const topic = 'ab'.repeat(32);
  const symKey = 'cd'.repeat(32);

  it('reads a version 2 link and writes the same one back', () => {
    const uri = `wc:${topic}@2?expiryTimestamp=1700000300&relay-protocol=irn&symKey=${symKey}`;

    expect(parsePairingUri(uri)).toEqual({ topic, version: 2, symKey, relay: { protocol: 'irn' }, expiryTimestamp: 1700000300 });
    expect(formatPairingUri({ topic, symKey, relay: { protocol: 'irn' }, expiryTimestamp: 1700000300 })).toBe(uri);
    expect(parsePairingUri(`wc://${topic}@2?symKey=${symKey}`).relay).toEqual({ protocol: 'irn' });
  });

  it('refuses a retired version 1 link as UNKNOWN_TYPE and anything malformed as MISSING_OR_INVALID', () => {
    expect(() => parsePairingUri(`wc:${topic}@1?bridge=https%3A%2F%2Fbridge.example&key=${symKey}`)).toThrow(
      getInternalError('UNKNOWN_TYPE').message
    );
    for (const uri of [
      'https://example.org',
      `wc:${topic}@2`,
      `wc:${topic}@2?symKey=short`,
      `wc:${topic}@2?symKey=${symKey}&relay-protocol=waku`,
      `wc:not-a-topic@2?symKey=${symKey}`,
      `wc:${topic}@2?symKey=${symKey}&expiryTimestamp=soon`,
      `wc:${topic}@3?symKey=${symKey}`,
    ])
      expect(() => parsePairingUri(uri), uri).toThrow(getInternalError('MISSING_OR_INVALID').message);
  });
});

describe('WalletConnect sessions between a dApp and Fearless', () => {
  it('settles a proposal the dApp sent before Fearless subscribed, answers a request and ends the session', async () => {
    const wallet = await client('Fearless');
    const dapp = await client('Public dApp');
    const { uri, approval } = await dapp.connect(PROPOSAL);
    const pairingTopic = parsePairingUri(uri).topic;

    // Nobody listens yet: the relay holds the proposal for the wallet.
    await settle();
    expect(relay.heldFor(pairingTopic)).toBe(1);
    const proposal = once(wallet, 'session_proposal');

    await wallet.pair({ uri });
    const { id, params, verifyContext } = await proposal;

    expect(params).toMatchObject({ pairingTopic, proposer: { metadata: { name: 'Public dApp' } }, requiredNamespaces: {} });
    expect(params.optionalNamespaces).toEqual(PROPOSAL.optionalNamespaces);
    expect(verifyContext.verified).toMatchObject({ validation: 'UNKNOWN', origin: 'https://public-dapp.example' });
    const approved = await wallet.approve({ id, namespaces: GRANT });
    const session = await approval();

    expect(session.topic).toBe(approved.topic);
    expect(session.namespaces).toEqual(GRANT);
    expect(session.controller).toBe(session.peer.publicKey);
    await expect(approved.acknowledged()).resolves.toMatchObject({ acknowledged: true });
    const walletSession = wallet.session.get(approved.topic);

    expect(walletSession.controller).toBe(walletSession.self.publicKey);
    wallet.on('session_request', ({ id: requestId, topic, params: request }) => {
      void wallet.respond({ topic, response: formatJsonRpcResult(requestId, `signed ${request.request.params[0]}`) });
    });
    await expect(
      dapp.request({ topic: session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] } })
    ).resolves.toBe('signed 0x01');
    const deleted = once(dapp, 'session_delete');

    await wallet.disconnect({ topic: approved.topic, reason: getSdkError('USER_DISCONNECTED') });
    await deleted;
    expect(wallet.session.values).toEqual([]);
    expect(dapp.session.values).toEqual([]);
  });

  it('tells the dApp when Fearless refuses its proposal', async () => {
    const wallet = await client('Fearless');
    const dapp = await client('Public dApp');
    const { uri, approval } = await dapp.connect(PROPOSAL);
    const outcome = approval().then(() => 'approved', (error: Error & { code?: number }) => error);
    const proposal = once(wallet, 'session_proposal');

    await wallet.pair({ uri });
    await wallet.reject({ id: (await proposal).id, reason: getSdkError('UNSUPPORTED_CHAINS') });

    await expect(outcome).resolves.toMatchObject({ code: 5100, message: 'Unsupported chains.' });
    expect(dapp.session.values).toEqual([]);
    await expect(wallet.approve({ id: (await proposal).id, namespaces: GRANT })).rejects.toThrow('No matching key');
  });

  it('offers each request as it arrives: an unanswered one does not hold another session, and a redelivered one is offered once', async () => {
    const wallet = await client('Fearless');
    const first = await client('First dApp');
    const second = await client('Second dApp');
    const one = await settled(wallet, first);
    const two = await settled(wallet, second, { eip155: { ...GRANT.eip155, accounts: [`eip155:1:${EVM_TWO}`] } });
    const offered: { id: number; topic: string }[] = [];

    wallet.on('session_request', ({ id, topic }) => {
      offered.push({ id, topic });
      // Only the second session's request is answered.
      if (topic === two.topic) void wallet.respond({ topic, response: formatJsonRpcResult(id, 'second answered') });
    });
    const pending = first.request({ topic: one.session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] } });

    await settle();
    await expect(
      second.request({ topic: two.session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x02', EVM_TWO] } })
    ).resolves.toBe('second answered');
    // The same request id again on the same session, freshly encrypted: still one offer.
    const record = memoryStorageOf(wallet);
    const firstId = offered.find(({ topic }) => topic === one.topic)!.id;

    await inject(one.topic, record.keys[one.topic], formatJsonRpcRequest('wc_sessionRequest', { request: { method: 'personal_sign', params: ['0x01', EVM] }, chainId: 'eip155:1' }, firstId));
    await settle();
    expect(offered.map(({ topic }) => topic)).toEqual([one.topic, two.topic]);
    void pending.catch(() => undefined);
  });

  it('refuses requests in a session where Fearless is the dApp', async () => {
    const fearless = await client('Fearless');
    const { topic, sessionKey } = await dappSessionWithKeys(fearless);
    const offered = vi.fn();
    const request = formatJsonRpcRequest('wc_sessionRequest', { request: { method: 'personal_sign', params: [] }, chainId: 'eip155:1' });

    fearless.on('session_request', offered);
    await inject(topic, sessionKey, request);
    await settle();
    expect(offered).not.toHaveBeenCalled();
    expect(answeredError(topic, sessionKey, request.id)).toBe(getSdkError('UNAUTHORIZED_METHOD').code);
  });

  it('refuses an update or an extension from a dApp in a session Fearless controls', async () => {
    const wallet = await client('Fearless');
    const { topic, symKey } = await walletSessionWithKeys(wallet);
    const before = wallet.session.get(topic);
    const update = formatJsonRpcRequest('wc_sessionUpdate', {
      namespaces: { eip155: { ...GRANT.eip155, accounts: [`eip155:1:${EVM}`, `eip155:1:${EVM_TWO}`] } },
    });
    const extend = formatJsonRpcRequest('wc_sessionExtend', {});

    await inject(topic, symKey, update);
    await inject(topic, symKey, extend);
    await settle();
    expect(answeredError(topic, symKey, update.id)).toBe(getSdkError('UNAUTHORIZED_UPDATE_REQUEST').code);
    expect(answeredError(topic, symKey, extend.id)).toBe(getSdkError('UNAUTHORIZED_EXTEND_REQUEST').code);
    expect(wallet.session.get(topic)).toEqual(before);
  });

  it('refuses a settlement whose controller is not the wallet that answered, and a settlement nobody waits for', async () => {
    const dapp = await client('Fearless as dApp');
    const { uri, approval } = await dapp.connect({ optionalNamespaces: { polkadot: { chains: [DOT], methods: ['polkadot_signMessage'], events: [] } } });
    const outcome = approval().then(() => 'approved', (error: Error) => error.message);
    const { topic: pairingTopic, symKey } = parsePairingUri(uri);
    const proposal = (memoryStorageOf(dapp).sentProposals[0]).proposal;
    const phone = generateKeyPair();
    const sessionKey = deriveSymKey(phone.privateKey, proposal.proposer.publicKey);

    await inject(pairingTopic, symKey, formatJsonRpcResult(proposal.id, { relay: { protocol: 'irn' }, responderPublicKey: phone.publicKey }));
    await settle();
    const impostor = generateKeyPair().publicKey;

    await inject(topicOf(sessionKey), sessionKey, formatJsonRpcRequest('wc_sessionSettle', {
      relay: { protocol: 'irn' },
      namespaces: { polkadot: { chains: [DOT], accounts: [`${DOT}:${SUBSTRATE}`], methods: ['polkadot_signMessage'], events: [] } },
      expiry: Math.floor(Date.now() / 1000) + 3600,
      controller: { publicKey: impostor, metadata: PEER },
    }));
    await expect(outcome).resolves.toBe(getSdkError('INVALID_SESSION_SETTLE_REQUEST').message);
    expect(dapp.session.values).toEqual([]);
    expect(memoryStorageOf(dapp).keys[topicOf(sessionKey)]).toBeUndefined();
  });

  it('reports an unanswered request when it expires, and a session that expired while the worker was stopped', async () => {
    const storage = memoryStorage();
    const wallet = await client('Fearless', storage);
    const dapp = await client('Public dApp');
    const { topic, session } = await settled(wallet, dapp);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: Date.now() });
    const offered = once(wallet, 'session_request');
    const expired = once(wallet, 'session_request_expire');

    void dapp.request({ topic: session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] }, expiry: 300 }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    const { id } = await offered;

    await vi.advanceTimersByTimeAsync(300_000);
    await expect(expired).resolves.toEqual({ id, topic });
    vi.useRealTimers();
    wallet.close();
    // Eight days later the worker starts again.
    const later = Date.now() + 8 * 86_400_000;
    const restarted = await WalletConnectClient.init({
      projectId: 'public-test-project',
      relayUrl: 'wss://relay.test',
      metadata: { name: 'Fearless', description: '', url: 'https://fearless.example', icons: [] },
      storage,
      createSocket: relay.createSocket,
      fetch: offlineVerify,
      now: () => later,
    });

    open.push(restarted);
    const ended = once(restarted, 'session_expire');

    await expect(ended).resolves.toEqual({ topic });
    expect(restarted.session.values).toEqual([]);
  });

  it('keeps a session across a worker restart and goes on answering on it', async () => {
    const storage = memoryStorage();
    const wallet = await client('Fearless', storage);
    const dapp = await client('Public dApp');
    const { topic, session } = await settled(wallet, dapp);

    wallet.close();
    const restarted = await client('Fearless', storage);

    expect(restarted.session.get(topic)).toMatchObject({ acknowledged: true, topic });
    restarted.on('session_request', ({ id, topic: on }) => void restarted.respond({ topic: on, response: formatJsonRpcResult(id, 'after restart') }));
    await expect(
      dapp.request({ topic: session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] } })
    ).resolves.toBe('after restart');
  });

  it('carries over the sessions WalletConnect SDK 2.x saved, with their keys and relay identity', async () => {
    const original = memoryStorage();
    const wallet = await client('Fearless', original);
    const dapp = await client('Public dApp');
    const { topic, session } = await settled(wallet, dapp);
    const record = original.read<WalletConnectRecord>(WALLET_CONNECT_RECORD)!;

    wallet.close();
    // The same session as SDK 2.x stored it, and nothing of this client's own record.
    const sdk = memoryStorage({
      [SDK_KEYCHAIN]: { [topic]: record.keys[topic], client_ed25519_seed: record.clientSeed, unrelated: 'ignored' },
      [SDK_SESSIONS]: record.sessions,
      'wc@2:core:0.3//pairing': [],
    });
    const upgraded = await client('Fearless', sdk);

    expect(upgraded.session.get(topic)).toMatchObject({ topic, acknowledged: true });
    expect(sdk.read<WalletConnectRecord>(WALLET_CONNECT_RECORD)).toMatchObject({ migratedFromSdk: true, clientSeed: record.clientSeed });
    // SDK records stay where they were, so an older version still finds them.
    expect(sdk.read(SDK_SESSIONS)).toEqual(record.sessions);
    upgraded.on('session_request', ({ id, topic: on }) => void upgraded.respond({ topic: on, response: formatJsonRpcResult(id, 'migrated') }));
    await expect(
      dapp.request({ topic: session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] } })
    ).resolves.toBe('migrated');
  });

  it('pairs with a phone wallet as the dApp and takes its update, extension and disconnection', async () => {
    const fearless = await client('Fearless');
    const phone = await client('Phone wallet');
    const grant = { polkadot: { chains: [DOT], accounts: [`${DOT}:${SUBSTRATE}`], methods: ['polkadot_signMessage'], events: [] } };
    const { uri, approval } = await fearless.connect({ requiredNamespaces: {}, optionalNamespaces: { polkadot: { chains: [DOT], methods: ['polkadot_signMessage'], events: [] } } });
    const proposal = once(phone, 'session_proposal');

    await phone.pair({ uri });
    const approved = await phone.approve({ id: (await proposal).id, namespaces: grant });
    const session = await approval();

    expect(session.peer.metadata.name).toBe('Phone wallet');
    expect(session.controller).toBe(session.peer.publicKey);
    expect(session.controller).not.toBe(session.self.publicKey);
    phone.on('session_request', ({ id, topic, params }) =>
      void phone.respond({ topic, response: formatJsonRpcResult(id, { signature: `0x${'ab'.repeat(64)}`, method: params.request.method }) })
    );
    await expect(
      fearless.request({ topic: session.topic, chainId: DOT, request: { method: 'polkadot_signMessage', params: { address: SUBSTRATE, message: '0x00' } } })
    ).resolves.toMatchObject({ method: 'polkadot_signMessage' });
    // The phone is the controller: its update and extension are taken.
    const record = memoryStorageOf(phone);
    const updated = once(fearless, 'session_update');
    const narrower = { polkadot: { ...grant.polkadot, methods: ['polkadot_signMessage'], events: ['accountsChanged'] } };

    await inject(approved.topic, record.keys[approved.topic], formatJsonRpcRequest('wc_sessionUpdate', { namespaces: narrower }));
    await expect(updated).resolves.toMatchObject({ topic: session.topic, params: { namespaces: narrower } });
    const extended = once(fearless, 'session_extend');

    await inject(approved.topic, record.keys[approved.topic], formatJsonRpcRequest('wc_sessionExtend', {}));
    await extended;
    const deleted = once(fearless, 'session_delete');

    await phone.disconnect({ topic: approved.topic, reason: getSdkError('USER_DISCONNECTED') });
    await deleted;
    expect(fearless.session.values).toEqual([]);
  });

  it('ignores a proposal it cannot read', async () => {
    const wallet = await client('Fearless');
    const topic = randomKey();
    const symKey = randomKey();
    const offered = vi.fn();

    wallet.on('session_proposal', offered);
    await wallet.pair({ uri: formatPairingUri({ topic, symKey, relay: { protocol: 'irn' } }) });
    for (const params of [
      { proposer: { publicKey: 'not-a-key', metadata: { name: 'x', url: 'https://x.example' } } },
      { proposer: { publicKey: generateKeyPair().publicKey, metadata: { name: 'x', url: 'https://x.example' } }, optionalNamespaces: { 'Not A Key!': { methods: [], events: [] } } },
      { proposer: { publicKey: generateKeyPair().publicKey, metadata: { name: 'x', url: 'x'.repeat(5000) } } },
      { proposer: { publicKey: generateKeyPair().publicKey, metadata: { name: 'x', url: 'https://x.example' } }, requiredNamespaces: { eip155: { chains: Array(600).fill('eip155:1'), methods: [], events: [] } } },
    ])
      await inject(topic, symKey, formatJsonRpcRequest('wc_sessionPropose', { relays: [{ protocol: 'irn' }], ...params }));
    await settle();
    expect(offered).not.toHaveBeenCalled();
  });

  it('connects to the relay with a fresh sign-in token and the project id, and reconnects after the relay drops it', async () => {
    const wallet = await client('Fearless');
    const dapp = await client('Public dApp');
    const { session, topic } = await settled(wallet, dapp);
    const url = new URL(relay.urls.find((entry) => entry.includes('auth=ey'))!);

    expect(`${url.protocol}//${url.host}`).toBe('wss://relay.test');
    expect(url.searchParams.get('projectId')).toBe('public-test-project');
    expect(url.searchParams.get('useOnCloseEvent')).toBe('true');
    expect(url.searchParams.get('auth')!.split('.')).toHaveLength(3);
    relay.disconnectAll();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    wallet.on('session_request', ({ id, topic: on }) => void wallet.respond({ topic: on, response: formatJsonRpcResult(id, 'reconnected') }));
    await expect(
      dapp.request({ topic: session.topic, chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x01', EVM] } })
    ).resolves.toBe('reconnected');
    expect(wallet.session.get(topic).acknowledged).toBe(true);
  }, 15_000);
});

describe('WalletConnect verification', () => {
  const message = encrypt({ symKey: randomKey(), message: '{"id":1}' });
  const metadata = { name: 'Public dApp', description: '', url: 'https://public.example/app', icons: [] };

  async function signer() {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const sign = async (claims: Record<string, unknown>) => {
      const part = (value: unknown) => base64urlnopad.encode(new TextEncoder().encode(JSON.stringify(value)));
      const body = `${part({ alg: 'ES256', typ: 'JWT' })}.${part(claims)}`;
      const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(body)));

      return `${body}.${base64urlnopad.encode(signature)}`;
    };
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/v3/public-key')
        ? { status: 200, json: async () => ({ publicKey: jwk, expiresAt: Math.floor(Date.now() / 1000) + 3600 }) }
        : { status: 404, json: async () => undefined }
    );

    return { sign, fetcher };
  }

  const claims = (overrides: Record<string, unknown> = {}) => ({
    exp: Math.floor(Date.now() / 1000) + 300,
    id: hashMessage(message),
    origin: 'https://public.example',
    isScam: false,
    isVerified: true,
    ...overrides,
  });

  it('accepts a signed attestation for this exact message and compares its origin with the claimed URL', async () => {
    const { sign, fetcher } = await signer();
    const verify = new VerifyClient(fetcher);

    await expect(verify.context({ metadata, message, attestation: await sign(claims()) })).resolves.toEqual({
      verified: { verifyUrl: 'https://verify.walletconnect.org', validation: 'VALID', origin: 'https://public.example', isScam: false },
    });
    await expect(verify.context({ metadata, message, attestation: await sign(claims({ origin: 'https://phish.example', isScam: true })) })).resolves.toMatchObject({
      verified: { validation: 'INVALID', origin: 'https://phish.example', isScam: true },
    });
  });

  it('leaves the context unknown for an attestation that is forged, expired, unverified or for another message', async () => {
    const { sign, fetcher } = await signer();
    const other = await signer();
    const verify = new VerifyClient(fetcher);

    for (const attestation of [
      await other.sign(claims()),
      await sign(claims({ exp: Math.floor(Date.now() / 1000) - 1 })),
      await sign(claims({ isVerified: false })),
      await sign(claims({ id: hashMessage('another message') })),
    ])
      await expect(verify.context({ metadata, message, attestation })).resolves.toMatchObject({
        verified: { validation: 'UNKNOWN', origin: 'https://public.example/app' },
      });
  });

  it('asks the trusted Verify service by the message hash when no attestation came with it', async () => {
    const fetcher = vi.fn(async (_url: string) => ({ status: 200, json: async () => ({ origin: 'https://public.example', isScam: false }) }));
    const verify = new VerifyClient(fetcher);

    await expect(verify.context({ metadata: { ...metadata, verifyUrl: 'https://verify.attacker.example' }, message })).resolves.toMatchObject({
      verified: { validation: 'VALID', verifyUrl: 'https://verify.walletconnect.org' },
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://verify.walletconnect.org/attestation/${hashMessage(message)}?v2Supported=true`,
      expect.anything()
    );
  });
});

/** The client's stored record, read the way a restarted worker reads it. */
function memoryStorageOf(target: WalletConnectClient): WalletConnectRecord {
  return (target as unknown as { record: WalletConnectRecord }).record;
}
