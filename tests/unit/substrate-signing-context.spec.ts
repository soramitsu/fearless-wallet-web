import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { TypeRegistry } from '@polkadot/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Extension from '@extension-base/background/handlers/Extension';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import { captureSubstrateSigningContext } from '@extension-base/services/request-service/handlers/substrateSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson } from '@extension-base/background/types/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import { signingReview } from '@/screens/extension-ui/signing/review';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const mocks = vi.hoisted(() => ({ denied: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

const genesisHash = `0x${'11'.repeat(32)}` as const;
const url = 'https://public.example';
let pair: ReturnType<Keyring['addFromUri']>, state: State, service: RequestService;
let handler: SubstrateRequestHandler, extension: Extension;
const metadata = (): MetadataDef => ({
  genesisHash,
  chain: 'Public chain',
  icon: 'polkadot',
  ss58Format: 42,
  specVersion: 1,
  tokenDecimals: 12,
  tokenSymbol: 'PUB',
  types: {},
});
const payload = (): SignerPayloadJSON => ({
  address: pair.address,
  genesisHash,
  blockHash: genesisHash,
  blockNumber: '0x00',
  era: '0x00',
  method: '0x1234',
  nonce: '0x02',
  specVersion: '0x01',
  transactionVersion: '0x01',
  tip: '0x00',
  signedExtensions: ['CheckNonce'],
  version: 4,
});
beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(() => {
  pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  mocks.denied.mockReset().mockResolvedValue(false);
  service = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
    knownMetadata: [metadata()],
  } as unknown as RequestService;
  state = {
    requestService: service,
    networkService: {
      networkMap: { public: { name: 'Public chain', genesisHash, ecosystem: 'substrate', disabled: false } },
    },
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getAllAccounts: () => [{ address: pair.address, publicKey: pair.addressRaw, meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } }],
      getPair: vi.fn(() => pair),
    },
  } as unknown as State;
  handler = new SubstrateRequestHandler(service, state);
  Object.assign(service, { getSignRequest: (id: string) => handler.getSignRequest(id) });
  extension = new Extension(state);
});
async function admit(value = payload(), id = 'public') {
  const result = handler.sign(
    url,
    new RequestExtrinsicSign(value),
    { address: pair.address, name: 'Public fixture' } as AccountJson,
    id
  );
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(handler.getSignRequest(id)).toBeDefined());
  vi.mocked(state.keyringService.getPair).mockClear();
  return { result, queued: handler.getSignRequest(id)! };
}
function replaceMetadata(value: MetadataDef[]) {
  Object.assign(service, { knownMetadata: value });
}
describe('captured Substrate metadata and network', () => {
  it.each(['genesis', 'method', 'version', 'extensions'])('rejects a hybrid raw payload with %s fields', (field) => {
    const mixed = {
      address: pair.address,
      data: '0x1234',
      type: 'bytes' as const,
      ...(field === 'genesis' ? { genesisHash } : {}),
      ...(field === 'method' ? { method: '0x1234' } : {}),
      ...(field === 'version' ? { version: 4 } : {}),
      ...(field === 'extensions' ? { signedExtensions: ['CheckNonce'] } : {}),
    };
    expect(() => captureSubstrateSigningContext(state, service, mixed)).toThrow();
  });
  it.each(['types', 'extensions', 'removed', 'spec', 'name', 'disabled', 'network removed'])(
    'rejects changed %s before obtaining a signing key',
    async (change) => {
      const { queued } = await admit();
      const resolve = vi.spyOn(queued, 'resolve');
      if (change === 'types') service.knownMetadata[0].types = { Index: 'u64' };
      if (change === 'extensions')
        service.knownMetadata[0].userExtensions = { CheckNonce: { extrinsic: {}, payload: { nonce: 'u64' } } };
      if (change === 'removed') replaceMetadata([]);
      if (change === 'spec') service.knownMetadata[0].specVersion = 2;
      if (change === 'name') state.networkService.networkMap.public.name = 'Replacement chain';
      if (change === 'disabled') state.networkService.networkMap.public.disabled = true;
      if (change === 'network removed') state.networkService.networkMap = {};
      expect(await extension.signingApprove({ id: 'public' })).toBe(false);
      expect(resolve).not.toHaveBeenCalled();
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
      expect(handler.getSignRequest('public')).toBeUndefined();
    }
  );
  it('keeps the published network label bound to admission despite live catalog replacement', async () => {
    await admit();
    state.networkService.networkMap.public.name = 'Replacement chain';
    const review = signingReview(handler.signSubject.value[0], Object.values(state.networkService.networkMap));
    expect(review.network).toBe('Public chain');
    expect(review.networkIdentity).toBe(genesisHash);
  });
  it('publishes a detached network label without exposing the private metadata definition', async () => {
    const { result } = await admit();
    const published = handler.signSubject.value[0];
    expect(published).not.toHaveProperty('signingContext');
    published.network!.name = 'Subscriber replacement';
    expect(handler.allSubstrateRequests[0].network!.name).toBe('Public chain');
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    await result;
  });
  it('refuses legacy queue data without a captured signing context', async () => {
    const { queued } = await admit();
    delete queued.signingContext;
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
  it('does not release a late signature after its metadata changes', async () => {
    const { queued } = await admit();
    const resolve = vi.spyOn(queued, 'resolve');
    let finish!: (value: { signature: `0x${string}` }) => void;
    const sign = vi.spyOn(queued.request, 'sign').mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    service.knownMetadata[0].chain = 'Changed metadata';
    finish({ signature: '0x1234' });
    expect(await pending).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('accepts a captured custom extension byte definition in external completion', async () => {
    const definition = { extrinsic: {}, payload: { nonce: 'u64' } };
    service.knownMetadata[0].userExtensions = { PublicExtension: definition };
    const value = { ...payload(), signedExtensions: ['PublicExtension'] };
    const { result } = await admit(value);
    const registry = new TypeRegistry();
    registry.setSignedExtensions(value.signedExtensions, { PublicExtension: definition });
    const { signature } = registry.createType('ExtrinsicPayload', value, { version: 4 }).sign(pair);
    expect(await extension.signingApproveSignature({ id: 'public', signature })).toBe(true);
    expect((await result).payload).toBe(signature);
  });
  it.each(['duplicate extension', 'disabled network', 'ambiguous network', 'ambiguous metadata', 'version five'])(
    'rejects %s at admission',
    async (change) => {
      const value = payload();
      if (change === 'duplicate extension') value.signedExtensions.push('CheckNonce');
      if (change === 'disabled network') state.networkService.networkMap.public.disabled = true;
      if (change === 'ambiguous network')
        state.networkService.networkMap.other = { ...state.networkService.networkMap.public };
      if (change === 'ambiguous metadata') replaceMetadata([metadata(), metadata()]);
      if (change === 'version five') value.version = 5;
      await expect(
        handler.sign(url, new RequestExtrinsicSign(value), { address: pair.address } as AccountJson)
      ).rejects.toThrow();
      expect(handler.numSubstrateRequests).toBe(0);
    }
  );
  it.each(['local', 'external'])('rejects metadata mutation during %s phishing lookup', async (route) => {
    const { queued } = await admit();
    const resolve = vi.spyOn(queued, 'resolve');
    const registry = new TypeRegistry();
    registry.setSignedExtensions(['CheckNonce']);
    const { signature } = registry.createType('ExtrinsicPayload', payload(), { version: 4 }).sign(pair);
    let finish!: (value: boolean) => void;
    mocks.denied.mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = (
      route === 'local'
        ? extension.signingApprove({ id: 'public' })
        : extension.signingApproveSignature({ id: 'public', signature })
    ).catch(() => false);
    service.knownMetadata[0].chain = 'Changed metadata';
    finish(false);
    expect(await pending).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rejects new metadata where admission used defaults', async () => {
    replaceMetadata([]);
    const { queued } = await admit();
    const resolve = vi.spyOn(queued, 'resolve');
    replaceMetadata([metadata()]);
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('does not inherit another network signature registration', async () => {
    service.knownMetadata[0].types = { ExtrinsicSignature: 'AnySignature' };
    const first = await admit();
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    expect((await first.result).payload.length).toBe(130); // Unprefixed 64-byte signature.
    replaceMetadata([]);
    const second = await admit({ ...payload(), genesisHash: `0x${'22'.repeat(32)}` }, 'second');
    expect(await extension.signingApprove({ id: 'second' })).toBe(true);
    expect((await second.result).payload.length).toBe(132); // Default MultiSignature restores its tag.
  });
  it('rejects an unrecognized signed extension before queue publication', async () => {
    await expect(
      handler.sign(url, new RequestExtrinsicSign({ ...payload(), signedExtensions: ['UnknownExtension'] }), {
        address: pair.address,
      } as AccountJson)
    ).rejects.toThrow();
    expect(handler.numSubstrateRequests).toBe(0);
  });
  it('rejects custom encoding metadata for a different runtime version', async () => {
    service.knownMetadata[0].types = { Index: 'u64' };
    service.knownMetadata[0].specVersion = 2;
    await expect(
      handler.sign(url, new RequestExtrinsicSign(payload()), { address: pair.address } as AccountJson)
    ).rejects.toThrow();
    expect(handler.numSubstrateRequests).toBe(0);
  });
});
