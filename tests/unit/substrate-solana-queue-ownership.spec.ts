import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base58Decode, cryptoWaitReady, signatureVerify } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import { TypeRegistry } from '@polkadot/types';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson, ResponseSigning } from '@extension-base/background/types/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { KeyringPair } from '@subwallet/keyring/types';
import type {
  SolanaFeeForMessageResponse,
  SolanaSimulationResponse,
} from '@extension-base/services/solana-rpc-service';

vi.mock('@extension-base/background/handlers', () => ({ state: {} }));
const url = 'https://public.example';
const substrateAddress = '5GrwvaEF5zXb26Fz9rcQpDWS64m3TtCHkb1ik3pMkLx4JTHu';
const solanaAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const substrateResult: ResponseSigning = { id: 'public', payload: '0x1234' };
const solanaResult = { publicKey: solanaAddress, signatureBase58: 'public', signatureBase64: 'AQIDBA==' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
let service: RequestService;
beforeEach(() => {
  service = {
    knownMetadata: [],
    authRequestHandler: { getSigningAuthorizationRevision: vi.fn(() => 0) },
    ensureAccountAuthorized: vi.fn(async () => true),
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
  } as unknown as RequestService;
});
function substrate() {
  const handler = new SubstrateRequestHandler(service, { networkService: { networkMap: {} } } as State);
  const payload: SignerPayloadRaw = { address: substrateAddress, data: '0x1234', type: 'bytes' };
  const account = { address: substrateAddress, name: 'Public signer', isMobile: false } as AccountJson;
  const request = new RequestBytesSign(payload);
  return { handler, payload, account, request };
}
const solanaAccount = () => ({ address: solanaAddress, publicKey: solanaAddress, name: 'Public signer' });
const message = () => ({ origin: 'Public app', messageBase64: 'AQIDBA==', display: 'utf8' as const });
const transactionBase64 = Buffer.concat([
  Buffer.from([1]),
  Buffer.alloc(64),
  Buffer.from([1, 0, 1, 2]),
  Buffer.from(base58Decode(solanaAddress)),
  Buffer.alloc(32),
  Buffer.alloc(32, 9),
  Buffer.from([1, 1, 1, 0, 0]),
]).toString('base64');

describe('Substrate queue identity and detached review payloads', () => {
  it('signs the captured bytes after both the caller and review subscriber change their copies', async () => {
    await cryptoWaitReady();
    const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
    const barrier = deferred<boolean>();
    vi.mocked(service.ensureAccountAuthorized).mockReturnValueOnce(barrier.promise);
    const { handler, payload, account, request } = substrate();
    account.address = payload.address = pair.address;
    void handler.sign(url, request, account, 'public');
    payload.data = '0xabcd';
    barrier.resolve(true);
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    (handler.signSubject.value[0].request.payload as SignerPayloadRaw).data = '0xffff';
    // The raw signer needs pair.sign; use a public Polkadot development key without loading the wallet runtime.
    const signed = await handler
      .getSignRequest('public')!
      .request.sign(new TypeRegistry(), pair as unknown as KeyringPair);
    expect(signatureVerify(wrapBytes('0x1234'), signed.signature, pair.publicKey).isValid).toBe(true);
    expect(signatureVerify(wrapBytes('0xabcd'), signed.signature, pair.publicKey).isValid).toBe(false);
    expect(signatureVerify(wrapBytes('0xffff'), signed.signature, pair.publicKey).isValid).toBe(false);
  });
  it('retains the extrinsic payload and signed-extension list consumed by the signer', async () => {
    const { handler, account } = substrate();
    const payload = {
      address: substrateAddress,
      method: '0x1234',
      genesisHash: `0x${'00'.repeat(32)}`,
      blockHash: `0x${'00'.repeat(32)}`,
      blockNumber: '0x00',
      era: '0x00',
      nonce: '0x00',
      specVersion: '0x01',
      transactionVersion: '0x01',
      tip: '0x00',
      signedExtensions: ['CheckNonce'],
      version: 4,
    } as SignerPayloadJSON;
    const barrier = deferred<boolean>();
    vi.mocked(service.ensureAccountAuthorized).mockReturnValueOnce(barrier.promise);
    void handler.sign(url, new RequestExtrinsicSign(payload), account, 'public');
    payload.method = '0xabcd';
    payload.signedExtensions.push('Replacement');
    barrier.resolve(true);
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    const createType = vi.fn(() => ({ sign: () => ({ signature: '0x1234' }) }));
    await handler.getSignRequest('public')!.request.sign({ createType } as unknown as TypeRegistry, {} as KeyringPair);
    expect(createType).toHaveBeenCalledWith(
      'ExtrinsicPayload',
      expect.objectContaining({ method: '0x1234', signedExtensions: ['CheckNonce'] }),
      { version: 4 }
    );
  });
  it('captures payload and account before the admission await', async () => {
    const barrier = deferred<boolean>();
    vi.mocked(service.ensureAccountAuthorized).mockReturnValueOnce(barrier.promise);
    const { handler, payload, account, request } = substrate();
    void handler.sign(url, request, account, 'public');
    payload.data = '0xabcd';
    account.name = 'Replacement';
    barrier.resolve(true);
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    expect(handler.getSignRequest('public')?.request.payload).toMatchObject({ data: '0x1234' });
    expect(handler.getSignRequest('public')?.account.name).toBe('Public signer');
  });
  it('does not let a published review mutate the private signer or account', async () => {
    const { handler, account, request } = substrate();
    void handler.sign(url, request, account, 'public');
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    const published = handler.signSubject.value[0];
    (published.request.payload as SignerPayloadRaw).data = '0xabcd';
    published.account.name = 'Replacement';
    expect(handler.getSignRequest('public')?.request.payload).toMatchObject({ data: '0x1234' });
    expect(handler.getSignRequest('public')?.account.name).toBe('Public signer');
  });
  it('rejects a duplicate active ID without overwriting its owner', async () => {
    const { handler, account, request } = substrate();
    void handler.sign(url, request, account, 'public');
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    const first = handler.getSignRequest('public');
    let error: unknown;
    void handler.sign(url, request, account, 'public').catch((value) => {
      error = value;
    });
    await vi.waitFor(() => expect(error).toBeInstanceOf(Error));
    expect(handler.getSignRequest('public')).toBe(first);
  });
  it('makes completion one-shot when an ID is reused', async () => {
    const { handler, account, request } = substrate();
    const firstResult = handler.sign(url, request, account, 'public');
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    const first = handler.getSignRequest('public')!;
    first.resolve(substrateResult);
    await firstResult;
    void handler.sign(url, request, account, 'public');
    await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
    const second = handler.getSignRequest('public');
    first.resolve(substrateResult);
    expect(handler.getSignRequest('public')).toBe(second);
  });
});

describe('Solana queue identity and detached review payloads', () => {
  it('simulates the captured transaction after a synchronous subscriber changes the caller input', () => {
    const handler = new SolanaRequestHandler(service);
    const request = { origin: 'Public app', transactionBase64 };
    const subscription = handler.signSolanaSubject.subscribe((published) => {
      if (published.public) request.transactionBase64 = 'BQYHCA==';
    });
    const simulate = vi.fn(() => new Promise<SolanaSimulationResponse>(() => {}));
    void handler.confirmSignAndSendTransaction(url, request, solanaAccount(), 'public', simulate);
    expect(simulate).toHaveBeenCalledWith(transactionBase64);
    expect(handler.getSolanaSignRequest('public')!.transactionBase64).toBe(transactionBase64);
    subscription.unsubscribe();
  });
  it('copies the account supplied by admission', () => {
    const handler = new SolanaRequestHandler(service),
      account = solanaAccount();
    void handler.confirmSignMessage(url, message(), account, 'public');
    account.address = 'replacement';
    expect(handler.getSolanaSignRequest('public')?.account.address).toBe(solanaAddress);
  });
  it('copies transaction batches before a caller changes them', () => {
    const handler = new SolanaRequestHandler(service),
      transactionsBase64 = ['AQIDBA=='];
    void handler.confirmSignAllTransactions(
      url,
      { origin: 'Public app', transactionsBase64 },
      solanaAccount(),
      'public'
    );
    transactionsBase64[0] = 'BQYHCA==';
    expect(handler.getSolanaSignRequest('public')?.transactionsBase64).toEqual(['AQIDBA==']);
  });
  it('does not let a subscriber rewrite queued signing data', () => {
    const handler = new SolanaRequestHandler(service);
    void handler.confirmSignAllTransactions(
      url,
      { origin: 'Public app', transactionsBase64: ['AQIDBA=='] },
      solanaAccount(),
      'public'
    );
    const published = handler.signSolanaSubject.value.public;
    published.transactionsBase64![0] = 'BQYHCA==';
    published.account.address = 'replacement';
    expect(handler.getSolanaSignRequest('public')?.transactionsBase64).toEqual(['AQIDBA==']);
    expect(handler.getSolanaSignRequest('public')?.account.address).toBe(solanaAddress);
  });
  it('rejects a duplicate ID without replacing the first owner', async () => {
    const handler = new SolanaRequestHandler(service);
    void handler.confirmSignMessage(url, message(), solanaAccount(), 'public');
    const first = handler.getSolanaSignRequest('public');
    let error: unknown;
    void handler.confirmSignMessage(url, message(), solanaAccount(), 'public').catch((value) => {
      error = value;
    });
    await vi.waitFor(() => expect(error).toBeInstanceOf(Error));
    expect(handler.getSolanaSignRequest('public')).toBe(first);
  });
  it('does not let a settled resolver remove a later request', async () => {
    const handler = new SolanaRequestHandler(service);
    const firstResult = handler.confirmSignMessage(url, message(), solanaAccount(), 'public');
    const first = handler.getSolanaSignRequest('public')!;
    first.resolve(solanaResult);
    await firstResult;
    void handler.confirmSignMessage(url, message(), solanaAccount(), 'public');
    const second = handler.getSolanaSignRequest('public');
    first.resolve(solanaResult);
    expect(handler.getSolanaSignRequest('public')).toBe(second);
  });
  it.each(['fee', 'simulation'] as const)('never attaches an old %s result to a new owner', async (kind) => {
    const handler = new SolanaRequestHandler(service);
    const simulation = deferred<SolanaSimulationResponse>(),
      fee = deferred<SolanaFeeForMessageResponse>();
    const simulate = vi.fn(() => simulation.promise),
      estimate = vi.fn(() => fee.promise);
    const firstResult = handler.confirmSignAndSendTransaction(
      url,
      { origin: 'Public app', transactionBase64 },
      solanaAccount(),
      'public',
      simulate,
      estimate
    );
    expect(simulate).toHaveBeenCalledOnce();
    expect(estimate).toHaveBeenCalledOnce();
    handler.getSolanaSignRequest('public')!.resolve(solanaResult);
    await firstResult;
    void handler.confirmSignMessage(url, message(), solanaAccount(), 'public');
    simulation.resolve({ context: { slot: 4 }, value: { err: null, logs: [], unitsConsumed: 3 } });
    fee.resolve({ context: { slot: 4 }, value: 1000 });
    await Promise.resolve();
    await Promise.resolve();
    expect(handler.getSolanaSignRequest('public')?.[kind]).toBeUndefined();
  });
});
