import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import Provider from '@walletconnect/universal-provider';
import { captureMobileSigningContext } from '@extension-base/services/wallet-connect-service/mobileSigningContext';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, Transaction } from 'ethers';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { TypeRegistry } from '@polkadot/types';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import KeyringSigner from '@extension-base/signers/KeyringSigner';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import { sessionStorage } from '../helpers/session-storage';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson } from '@extension-base/background/types/types';
import type { SessionTypes } from '@walletconnect/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
const background = vi.hoisted(() => ({ state: {} }));
vi.mock('@extension-base/background/handlers', () => ({ state: background.state, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', async () => ({
  chrome: (await import('../helpers/session-storage')).sessionStorage.chrome,
}));

// Unfunded public development material. No relay or chain connection is made.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const url = 'https://public.example';
const topic = 'public-mobile-session';
const genesis = `0x${'11'.repeat(32)}` as const;
const chainId = `polkadot:${'11'.repeat(16)}`;
let state: State, extension: Extension, service: RequestService;
let evm: EvmRequestHandler, substrate: SubstrateRequestHandler, mobile: WalletConnectDAppService;
let session: SessionTypes.Struct;
let alice: ReturnType<Keyring['addFromUri']>;
let record: { address: string; publicKey: Uint8Array; meta: Record<string, unknown> };
let send: ReturnType<typeof vi.fn>, listeners: Record<string, (event: { topic: string }) => void>;

beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(async () => {
  await new WalletConnectRetiredSessions().readTopics();
  sessionStorage.data = {};
  alice = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  record = {
    address: alice.address,
    publicKey: decodeAddress(alice.address),
    meta: {
      name: 'Public mobile account',
      isMobile: true,
      wcTopic: topic,
      ethereumAddress: wallet.address,
    },
  };
  session = {
    topic,
    acknowledged: true,
    expiry: Math.floor(Date.now() / 1000) + 600,
    peer: { publicKey: 'public-peer', metadata: { name: 'Public mobile wallet', url, icons: [], description: '' } },
    namespaces: {
      eip155: {
        accounts: [`eip155:1:${wallet.address}`],
        methods: ['personal_sign', 'eth_sendTransaction'],
        events: [],
      },
      polkadot: {
        accounts: [`${chainId}:${alice.address}`],
        methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
        events: [],
      },
    },
  } as unknown as SessionTypes.Struct;
  service = {
    knownMetadata: [],
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
  } as unknown as RequestService;
  evm = new EvmRequestHandler(service);
  state = {
    requestService: service,
    getAuthInfo: vi.fn(async () => ({})),
    getEvmAuthorizationSnapshot: () => ({
      revision: 0,
      authorization: {
        isAllowed: true,
        evmAuthorizedAccount: wallet.address,
        currentEvmNetworkKey: 'Ethereum',
      },
    }),
    networkService: {
      networkMap: {
        Ethereum: {
          name: 'Ethereum',
          chainId: '1',
          genesisHash: '0x1234',
          ecosystem: 'ethereum',
          assets: [],
        },
      },
    },
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getAllAccounts: () => [record],
      getAddresses: () => [record],
      getAddress: () => record,
      getSubstrateAddress: () => alice.address,
      getEthereumAddress: () => wallet.address,
      isMobileAccount: () => true,
      encodeAddress,
      getPair: vi.fn(() => undefined),
      accountExportPrivateKey: vi.fn(),
      forgetAddress: vi.fn(),
      getAllSubstrateAccounts: () => [],
    },
    cleanupDeletedAccount: vi.fn(),
    setCurrentAccount: vi.fn(),
  } as unknown as State;
  Object.assign(service.authRequestHandler, { getEvmAuthorizationSnapshot: (origin: string) => state.getEvmAuthorizationSnapshot(origin) });
  substrate = new SubstrateRequestHandler(service, state);
  Object.assign(service, {
    evmRequestHandler: evm,
    substrateRequestHandler: substrate,
    getSignRequest: (id: string) => evm.getEvmSignRequest(id) || substrate.getSignRequest(id),
  });
  send = vi.fn(async (event) => {
    if (event.request.method === 'personal_sign') return wallet.signMessage('hello');
    if (event.request.method === 'polkadot_signMessage')
      return { signature: u8aToHex(alice.sign(hexToU8a(event.request.params.message))) };
    const payload = event.request.params.transactionPayload;
    const registry = new TypeRegistry();
    registry.setSignedExtensions(payload.signedExtensions);
    const signature = registry.createType('ExtrinsicPayload', payload, { version: 4 }).sign(alice).signature;
    return { signature };
  });
  listeners = {};
  mobile = Object.create(WalletConnectDAppService.prototype) as WalletConnectDAppService;
  Object.assign(mobile, {
    state,
    sessionRevisions: new Map(),
    retiredTopics: new Set(),
    listenerClients: new WeakSet(),
    app: {
      client: {
        session: {
          get values() {
            return [session];
          },
        },
        request: send,
        disconnect: vi.fn(async () => undefined),
        on: vi.fn((name: string, handler: (event: { topic: string }) => void) => {
          listeners[name] = handler;
        }),
        pairing: { core: { on: vi.fn() } },
      },
    },
  });
  (mobile as unknown as { setListeners(): void }).setListeners();
  Object.assign(state, { walletConnectDappService: mobile });
  Object.assign(background.state, state);
  extension = new Extension(state);
});

function payload(): SignerPayloadJSON {
  return {
    address: alice.address,
    genesisHash: genesis,
    blockHash: genesis,
    blockNumber: '0x00',
    era: '0x00',
    method: '0x1234',
    nonce: '0x02',
    specVersion: '0x01',
    transactionVersion: '0x01',
    tip: '0x00',
    signedExtensions: ['CheckNonce'],
    version: 4,
  };
}
async function queue(kind: 'evm' | 'substrate') {
  const data = ['0x68656c6c6f', wallet.address];
  if (kind === 'evm') {
    const context = await captureEvmSigningContext(state, url, 'personal_sign', data);
    const result = evm.confirmSign('public', url, 'personal_sign', data, context);
    void result.catch(() => undefined);
    return { result };
  }
  const result = substrate.sign(
    url,
    new RequestExtrinsicSign(payload()),
    { address: alice.address } as AccountJson,
    'public'
  );
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(substrate.getSignRequest('public')).toBeDefined());
  return { result };
}
async function approve(kind: 'evm' | 'substrate') {
  try {
    return await (kind === 'evm'
      ? extension.signEvmApprove({ id: 'public' })
      : extension.signingApprove({ id: 'public' }));
  } catch {
    return false;
  }
}

describe.each(['evm', 'substrate'] as const)('mobile %s session continuity', (kind) => {
  const namespace = () => session.namespaces[kind === 'evm' ? 'eip155' : 'polkadot'];
  it.each(['method', 'account', 'chain', 'expired', 'unacknowledged', 'peer', 'topic'])(
    'refuses %s changes after admission before remote transport',
    async (change) => {
      const { result } = await queue(kind);
      if (change === 'method') namespace().methods = [];
      if (change === 'account') namespace().accounts = [];
      if (change === 'chain') namespace().chains = [kind === 'evm' ? 'eip155:10' : `polkadot:${'22'.repeat(16)}`];
      if (change === 'expired') session.expiry = 1;
      if (change === 'unacknowledged') session.acknowledged = false;
      if (change === 'peer') session.peer.publicKey = 'another-public-peer';
      if (change === 'topic') record.meta.wcTopic = 'replacement-topic';
      try {
        expect(await approve(kind)).toBe(false);
        expect(send).not.toHaveBeenCalled();
      } finally {
        service.getSignRequest('public')?.reject(new Error('Fixture cleanup'));
        await result.catch(() => undefined);
      }
    }
  );
  it.each(['session_update', 'session_extend', 'session_expire', 'session_delete', 'disconnect'])(
    'invalidates %s even if the old session data returns',
    async (event) => {
      const { result } = await queue(kind);
      if (event === 'disconnect') mobile.disconnect(topic);
      else listeners[event]?.({ topic });
      try {
        expect(await approve(kind)).toBe(false);
        expect(send).not.toHaveBeenCalled();
      } finally {
        service.getSignRequest('public')?.reject(new Error('Fixture cleanup'));
        await result.catch(() => undefined);
      }
    }
  );
  it('suppresses a result after an in-flight session change', async () => {
    const { result } = await queue(kind);
    const registry = new TypeRegistry();
    registry.setSignedExtensions(payload().signedExtensions);
    const response =
      kind === 'evm'
        ? await wallet.signMessage('hello')
        : {
            signature: registry.createType('ExtrinsicPayload', payload(), { version: 4 }).sign(alice).signature,
          };
    let done!: (value: unknown) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        })
    );
    const approving = approve(kind);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    listeners.session_update?.({ topic });
    done(response);
    expect(await approving).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it('preserves an unchanged approved session and exact valid signature', async () => {
    const { result } = await queue(kind);
    expect(await approve(kind)).toBe(true);
    await expect(result).resolves.toMatchObject({ id: 'public' });
    expect(send).toHaveBeenCalledOnce();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
});

describe('mobile routing and result integrity', () => {
  it('rejects a valid EVM signature for different bytes', async () => {
    const { result } = await queue('evm');
    send.mockResolvedValueOnce(await wallet.signMessage('different message'));
    expect(await approve('evm')).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it('does not allow transport to rewrite the queued EVM payload', async () => {
    const { result } = await queue('evm');
    send.mockImplementationOnce(async (event) => {
      event.request.params[0] = '0x00';
      return wallet.signMessage(new Uint8Array([0]));
    });
    expect(await approve('evm')).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it('routes raw Substrate bytes through an approved signMessage chain without a local pair', async () => {
    const tabs = new Tabs(state);
    const result = tabs.bytesSign(url, { address: alice.address, data: '0x1234', type: 'bytes' });
    let failure: unknown;
    void result.catch((error) => {
      failure = error;
    });
    await vi.waitFor(() => expect(failure || substrate.numSubstrateRequests === 1).toBeTruthy());
    expect(failure).toBeUndefined();
    const id = substrate.allSubstrateRequests[0].id;
    expect(await extension.signingApprove({ id })).toBe(true);
    await expect(result).resolves.toMatchObject({ id });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      topic,
      chainId,
      request: {
        method: 'polkadot_signMessage',
        params: { address: alice.address, message: u8aToHex(wrapBytes('0x1234')) },
      },
    });
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
});

describe('internal mobile extrinsic adapter', () => {
  it('retains the valid exact signature without exporting a key', async () => {
    const signer = new KeyringSigner({ registry: new TypeRegistry(), keyPair: null, isMobile: true });
    await expect(signer.signPayload(payload())).resolves.toMatchObject({ signature: expect.stringMatching(/^0x/) });
    expect(send).toHaveBeenCalledOnce();
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
  it.each(['session', 'nonce'])('rejects a changed %s during transport', async (change) => {
    const signer = new KeyringSigner({ registry: new TypeRegistry(), keyPair: null, isMobile: true });
    send.mockImplementationOnce(async (event) => {
      if (change === 'session') listeners.session_update({ topic });
      const data = event.request.params.transactionPayload;
      data.nonce = '0x03';
      const registry = new TypeRegistry();
      registry.setSignedExtensions(data.signedExtensions);
      return { signature: registry.createType('ExtrinsicPayload', data, { version: 4 }).sign(alice).signature };
    });
    await expect(signer.signPayload(payload())).rejects.toThrow();
  });
});

describe('approved mobile namespace admission', () => {
  const intent = () => ({ topic, method: 'personal_sign', address: wallet.address, chainId: 'eip155:1' });
  it.each([
    'missing topic',
    'wrong topic',
    'expired',
    'fractional expiry',
    'missing peer',
    'unacknowledged',
    'missing method',
    'wrong account',
    'wrong chain',
    'proposal only',
    'mixed grants',
  ])('rejects %s before any queue or forwarding', (change) => {
    const request = intent();
    if (change === 'missing topic') request.topic = '';
    if (change === 'wrong topic') session.topic = 'other';
    if (change === 'expired') session.expiry = 1;
    if (change === 'fractional expiry') session.expiry += 0.5;
    if (change === 'missing peer') session.peer.publicKey = '';
    if (change === 'unacknowledged') session.acknowledged = false;
    if (change === 'missing method') session.namespaces.eip155.methods = [];
    if (change === 'wrong account')
      session.namespaces.eip155.accounts = [`eip155:1:${new Wallet(`0x${'22'.repeat(32)}`).address}`];
    if (change === 'wrong chain') session.namespaces.eip155.chains = ['eip155:10'];
    if (change === 'proposal only') {
      session.requiredNamespaces = { eip155: { methods: ['personal_sign'], events: [], chains: ['eip155:1'] } };
      session.namespaces = {};
    }
    if (change === 'mixed grants') {
      session.namespaces['eip155:1'] = { accounts: [], methods: ['personal_sign'], events: [] };
      session.namespaces.eip155.methods = [];
    }
    expect(() => captureMobileSigningContext(mobile, request)).toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(evm.numEvmSignRequest + substrate.numSubstrateRequests).toBe(0);
  });
  it('accepts chain-specific approved namespaces and a checksum-equivalent EVM identity', () => {
    session.namespaces['eip155:1'] = session.namespaces.eip155;
    delete session.namespaces.eip155;
    const context = captureMobileSigningContext(mobile, { ...intent(), address: wallet.address.toLowerCase() });
    expect(context.chainId).toBe('eip155:1');
    expect(context.identity).toBe(wallet.address.toLowerCase());
  });
  it('accepts SS58 prefix aliases and selects an approved stable raw-message route', () => {
    session.namespaces.polkadot.accounts = [
      `polkadot:${'22'.repeat(16)}:${alice.address}`,
      `${chainId}:${encodeAddress(alice.publicKey, 0)}`,
    ];
    const context = captureMobileSigningContext(mobile, {
      topic,
      method: 'polkadot_signMessage',
      address: alice.address,
    });
    expect(context.chainId).toBe(chainId);
    expect(context.identity).toBe(u8aToHex(alice.publicKey));
  });
  it('rejects malformed checksum identities instead of comparing address strings without case', () => {
    session.namespaces.polkadot.accounts = [`${chainId}:${alice.address.toLowerCase()}`];
    expect(() =>
      captureMobileSigningContext(mobile, { topic, method: 'polkadot_signMessage', address: alice.address })
    ).toThrow();
  });
  it('keeps the captured grants detached and absent from the published queue', async () => {
    const { result } = await queue('evm');
    const queued = evm.getEvmSignRequest('public')!;
    expect(evm.signEvmSubject.value.public).not.toHaveProperty('mobileSession');
    session.namespaces.eip155.methods = [];
    expect(queued.mobileSession!.namespaces.eip155.methods).toContain('personal_sign');
    queued.reject(new Error('Fixture cleanup'));
    await result.catch(() => undefined);
  });
  it('does not attach duplicate lifecycle listeners to the same client', () => {
    (mobile as unknown as { setListeners(): void }).setListeners();
    listeners.session_update({ topic });
    expect(mobile.getSessionRevision(topic)).toBe(1);
    const client = (mobile as unknown as { app: { client: { on: ReturnType<typeof vi.fn> } } }).app.client;
    expect(client.on).toHaveBeenCalledTimes(4);
  });
  it('shares concurrent provider initialization', async () => {
    const app = (mobile as unknown as { app: Provider }).app;
    const init = vi.spyOn(Provider, 'init').mockResolvedValueOnce(app);
    const other = new WalletConnectDAppService(state);
    try {
      await Promise.all([
        (other as unknown as { initApp(): Promise<void> }).initApp(),
        (other as unknown as { initApp(): Promise<void> }).initApp(),
      ]);
      expect(init).toHaveBeenCalledOnce();
    } finally {
      init.mockRestore();
    }
  });
});

describe('actual tab entry snapshots', () => {
  it.each(['raw', 'extrinsic'])('captures %s bytes before the authorization wait', async (kind) => {
    let done!: () => void;
    vi.mocked(service.ensureAccountAuthorized).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = () => resolve(true);
        })
    );
    const tabs = new Tabs(state);
    const original = kind === 'raw' ? { address: alice.address, data: '0x1234', type: 'bytes' as const } : payload();
    const result = 'data' in original ? tabs.bytesSign(url, original) : tabs.extrinsicSign(url, original);
    void result.catch(() => undefined);
    if ('data' in original) original.data = '0x5678';
    else original.nonce = '0x03';
    done();
    await vi.waitFor(() => expect(substrate.numSubstrateRequests).toBe(1));
    const queued = substrate.allSubstrateRequests[0];
    expect(queued.account.ethereumAddress).toBe(wallet.address);
    const captured = queued.request.payload;
    if ('data' in captured) expect(captured.data).toBe('0x1234');
    else expect(captured.nonce).toBe('0x02');
    expect(await extension.signingApprove({ id: queued.id })).toBe(true);
    await result;
  });
});

describe('mobile raw-byte encoding', () => {
  it('sends the exact wrapped bytes to a mobile signer that signs hex verbatim', async () => {
    send.mockImplementationOnce(async (event) => ({
      signature: u8aToHex(alice.sign(hexToU8a(event.request.params.message))),
    }));
    const result = new Tabs(state).bytesSign(url, { address: alice.address, data: '0x1234', type: 'bytes' });
    void result.catch(() => undefined);
    await vi.waitFor(() => expect(substrate.numSubstrateRequests).toBe(1));
    const id = substrate.allSubstrateRequests[0].id;
    expect(await extension.signingApprove({ id })).toBe(true);
    await result;
    expect(send.mock.calls[0][0].request.params.message).toBe(u8aToHex(wrapBytes('0x1234')));
  });
});

describe('mobile EVM transaction result proof', () => {
  const recipient = '0x2222222222222222222222222222222222222222';
  const intent = () => ({ from: wallet.address, to: recipient, value: '0x7', data: '0x1234' });
  const signed = async (changes: Record<string, unknown> = {}, signer = wallet) =>
    Transaction.from(
      await signer.signTransaction({
        chainId: 1,
        nonce: 2,
        gasLimit: 30000,
        gasPrice: 3,
        type: 0,
        to: recipient,
        value: 7,
        data: '0x1234',
        ...changes,
      })
    );
  const rpcTransaction = (tx: Transaction) => ({
    type: tx.type,
    to: tx.to,
    data: tx.data,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit,
    gasPrice: tx.gasPrice,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    value: tx.value,
    chainId: tx.chainId,
    signature: tx.signature,
    accessList: tx.accessList,
    hash: tx.hash,
    from: tx.from,
  });
  async function setup(data: Record<string, unknown> = intent(), transaction?: Transaction) {
    const tx = transaction ?? (await signed());
    const provider = { getNetwork: vi.fn(async () => ({ chainId: 1n })), getTransaction: vi.fn(async () => tx) };
    Object.assign(state, { getEvmApi: vi.fn(() => ({ api: provider })) });
    send.mockResolvedValue(tx.hash);
    const context = await captureEvmSigningContext(state, url, 'eth_sendTransaction', [data]);
    const result = evm.confirmSign('public', url, 'eth_sendTransaction', [data], context);
    void result.catch(() => undefined);
    return { provider, result, tx };
  }
  it('releases only a reconstructed signed transaction matching the request', async () => {
    const { result, tx, provider } = await setup();
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(true);
    await expect(result).resolves.toEqual({ id: 'public', payload: tx.hash });
    expect(provider.getNetwork).toHaveBeenCalledOnce();
    expect(provider.getTransaction).toHaveBeenCalledWith(tx.hash);
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('does not trust an unsigned RPC gasPrice property on a dynamic-fee transaction', async () => {
    const tx = await signed({ type: 2, gasPrice: undefined, maxFeePerGas: 100, maxPriorityFeePerGas: 9 });
    const { result, provider } = await setup({ ...intent(), gasPrice: '0x3' }, tx);
    provider.getTransaction.mockResolvedValue({ ...rpcTransaction(tx), gasPrice: '3' } as never);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it.each([1, 2])('accepts a matching type %i with exact access-list and fee fields', async (type) => {
    const accessList = [{ address: recipient, storageKeys: [`0x${'ab'.repeat(32)}`] }];
    const fees = type === 1 ? { gasPrice: '0x3' } : { maxFeePerGas: '0x9', maxPriorityFeePerGas: '0x2' };
    const tx = await signed({ type, accessList, gasPrice: undefined, ...fees });
    const { result, provider } = await setup({ ...intent(), type, accessList, ...fees }, tx);
    // Ethers RPC responses can carry effective gasPrice for type2. It is not signed.
    if (type === 2) provider.getTransaction.mockResolvedValue({ ...rpcTransaction(tx), gasPrice: '5' } as never);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(true);
    await expect(result).resolves.toEqual({ id: 'public', payload: tx.hash });
  });
  it.each(['maxFeePerGas', 'maxPriorityFeePerGas'] as const)('rejects changed signed %s', async (field) => {
    const tx = await signed({ type: 2, gasPrice: undefined, maxFeePerGas: 10, maxPriorityFeePerGas: 3 });
    const { result } = await setup({ ...intent(), [field]: field === 'maxFeePerGas' ? '0x9' : '0x2' }, tx);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it.each(['unrequested', 'changed slot', 'changed address'])('rejects an %s access list', async (kind) => {
    const accessList = [{ address: recipient, storageKeys: [`0x${'ab'.repeat(32)}`] }];
    const requested =
      kind === 'unrequested'
        ? undefined
        : [
            {
              address: kind === 'changed address' ? wallet.address : recipient,
              storageKeys: [`0x${(kind === 'changed slot' ? 'cd' : 'ab').repeat(32)}`],
            },
          ];
    const tx = await signed({ type: 1, accessList });
    const { result } = await setup({ ...intent(), ...(requested ? { accessList: requested } : {}) }, tx);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it.each([3, 4])('rejects an unrequested signed type %i envelope', async (type) => {
    const tx = await signed({
      type,
      gasPrice: undefined,
      maxFeePerGas: 10,
      maxPriorityFeePerGas: 1,
      ...(type === 3
        ? { maxFeePerBlobGas: 1, blobVersionedHashes: [`0x01${'11'.repeat(31)}`] }
        : { authorizationList: [] }),
    });
    const { result } = await setup(intent(), tx);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it('accepts omitted value/data only when the signed fields are zero/empty', async () => {
    const tx = await signed({ value: 0, data: '0x' });
    const { result } = await setup({ from: wallet.address, to: recipient }, tx);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(true);
    await expect(result).resolves.toEqual({ id: 'public', payload: tx.hash });
  });
  it.each(['value', 'data'])('does not let mobile add omitted %s', async (field) => {
    const data: Record<string, unknown> = intent();
    delete data[field];
    const { result } = await setup(data);
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it('accepts exact contract creation when no recipient was requested', async () => {
    const data: Record<string, unknown> = intent();
    delete data.to;
    const { result, tx } = await setup(data, await signed({ to: null }));
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(true);
    await expect(result).resolves.toEqual({ id: 'public', payload: tx.hash });
  });
  it('consumes a lookup transport failure without resubmitting', async () => {
    const { result, provider } = await setup();
    provider.getTransaction.mockRejectedValue(new Error('offline fixture'));
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow('offline fixture');
    expect(evm.getEvmSignRequest('public')).toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
  it.each([
    ['recipient', { to: wallet.address }],
    ['value', { value: 8 }],
    ['data', { data: '0xdead' }],
    ['chain', { chainId: 2 }],
    ['nonce', { nonce: 3 }],
    ['gas limit', { gasLimit: 30001 }],
    ['gas price', { gasPrice: 4 }],
    ['type', { type: 1, accessList: [] }],
  ] as const)('rejects a valid signature over a different %s', async (_name, changes) => {
    const { result } = await setup(
      { ...intent(), nonce: '0x2', gas: '0x7530', gasPrice: '0x3', type: '0x0' },
      await signed(changes)
    );
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
    expect(send).toHaveBeenCalledOnce();
    expect(evm.getEvmSignRequest('public')).toBeUndefined();
  });
  it('rejects a transaction from another actual signer', async () => {
    const { result } = await setup(intent(), await signed({}, new Wallet(`0x${'22'.repeat(32)}`)));
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
  });
  it.each(['missing', 'unsigned', 'forged hash', 'forged from', 'different returned hash'])(
    'rejects %s RPC evidence without retrying mobile submission',
    async (kind) => {
      const { result, provider, tx } = await setup();
      if (kind === 'missing') provider.getTransaction.mockResolvedValue(null as never);
      if (kind === 'unsigned')
        provider.getTransaction.mockResolvedValue({ to: tx.to, from: wallet.address, chainId: 1n } as never);
      if (kind === 'forged hash')
        provider.getTransaction.mockResolvedValue({ ...rpcTransaction(tx), hash: tx.hash, value: '8' } as never);
      if (kind === 'forged from')
        provider.getTransaction.mockResolvedValue({ ...rpcTransaction(tx), hash: tx.hash, from: recipient } as never);
      if (kind === 'different returned hash') send.mockResolvedValue(`0x${'ab'.repeat(32)}`);
      expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
      await expect(result).rejects.toThrow();
      expect(send).toHaveBeenCalledOnce();
      await expect(extension.signEvmApprove({ id: 'public' })).rejects.toThrow();
      expect(send).toHaveBeenCalledOnce();
    }
  );
  it.each(['unavailable', 'wrong chain', 'replaced after chain lookup', 'revoked after chain lookup'])(
    'rejects a provider that is %s before mobile transport',
    async (kind) => {
      const { result, provider } = await setup();
      if (kind === 'unavailable') Object.assign(state, { getEvmApi: () => undefined });
      if (kind === 'wrong chain') provider.getNetwork.mockResolvedValue({ chainId: 2n });
      if (kind === 'replaced after chain lookup')
        provider.getNetwork.mockImplementation(async () => {
          Object.assign(state, { getEvmApi: () => ({ api: {} }) });
          return { chainId: 1n };
        });
      if (kind === 'revoked after chain lookup')
        provider.getNetwork.mockImplementation(async () => {
          listeners.session_delete({ topic });
          return { chainId: 1n };
        });
      expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
      await expect(result).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    }
  );
  it.each(['session retired', 'provider replaced', 'account topic changed'])(
    'rejects %s while waiting for transaction evidence',
    async (kind) => {
      const { result, provider, tx } = await setup();
      let finish!: (value: Transaction) => void;
      provider.getTransaction.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const approval = extension.signEvmApprove({ id: 'public' });
      await vi.waitFor(() => expect(provider.getTransaction).toHaveBeenCalledOnce());
      if (kind === 'session retired') listeners.session_expire({ topic });
      if (kind === 'provider replaced') Object.assign(state, { getEvmApi: () => ({ api: {} }) });
      if (kind === 'account topic changed') record.meta.wcTopic = 'changed';
      finish(tx);
      expect(await approval).toBe(false);
      await expect(result).rejects.toThrow();
      expect(send).toHaveBeenCalledOnce();
    }
  );
  it.each([
    { type: '0x3' },
    { type: '0x4' },
    { authorizationList: [] },
    { blobVersionedHashes: [] },
    { customData: {} },
    { input: '0x1234' },
    { gas: '-1' },
    { value: '-1' },
    { data: '0x1' },
    { gasPrice: '1', maxFeePerGas: '2' },
    { maxFeePerGas: '1', maxPriorityFeePerGas: '2' },
    { to: 'public.eth' },
    { nonce: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects unprovable or malformed intent before transport: %j', async (changes) => {
    const { result } = await setup({ ...intent(), ...changes });
    expect(await extension.signEvmApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
