import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, decodeAddress, encodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import Extension from '@extension-base/background/handlers/Extension';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import { TypeRegistry } from '@polkadot/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson } from '@extension-base/background/types/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const mocks = vi.hoisted(() => ({ denied: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

const url = 'https://public.example';
let alice: KeyringPair, bob: KeyringPair, selected: KeyringPair;
let records: { address: string; publicKey: Uint8Array; meta: Record<string, unknown> }[];
let state: State, service: RequestService, handler: SubstrateRequestHandler, extension: Extension;
beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(() => {
  alice = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  bob = new Keyring({ type: 'sr25519' }).addFromUri('//Bob');
  selected = alice;
  records = [
    { address: alice.address, publicKey: decodeAddress(alice.address), meta: { name: 'Stored public account', walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
  ];
  mocks.denied.mockReset().mockResolvedValue(false);
  service = {
    knownMetadata: [],
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
  } as unknown as RequestService;
  state = {
    requestService: service,
    networkService: { networkMap: {} },
    keyringService: {
      tonKeyring: { getAccounts: () => [] }, getAllAccounts: () => records, getPair: vi.fn(() => selected), unlockPair: vi.fn() },
    walletConnectDappService: {
      getSessionRevision: () => 0,
      getSession: (topic: string) => ({
        topic,
        acknowledged: true,
        expiry: 2000000000,
        peer: { publicKey: 'public-peer' },
        namespaces: {
          polkadot: {
            accounts: [`polkadot:${'11'.repeat(16)}:${alice.address}`],
            methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
            events: [],
          },
        },
      }),
      onRequest: vi.fn(async () => ({ signature: u8aToHex(alice.sign(wrapBytes('0x1234'))) })),
    },
  } as unknown as State;
  handler = new SubstrateRequestHandler(service, state);
  Object.assign(service, { getSignRequest: (id: string) => handler.getSignRequest(id) });
  extension = new Extension(state);
});
function start(payloadAddress = alice.address, accountAddress = alice.address) {
  const result = handler.sign(
    url,
    new RequestBytesSign({ address: payloadAddress, data: '0x1234', type: 'bytes' }),
    { address: accountAddress, name: 'Caller supplied label' } as AccountJson,
    'public'
  );
  void result.catch(() => undefined);
  return result;
}
async function admit(payloadAddress = alice.address, accountAddress = alice.address) {
  const result = start(payloadAddress, accountAddress);
  await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
  vi.mocked(state.keyringService.getPair).mockClear();
  return { result, queued: handler.getSignRequest('public')! };
}
async function rejectedAdmission(payloadAddress = alice.address, accountAddress = alice.address) {
  let rejected = false;
  const result = start(payloadAddress, accountAddress).catch(() => {
    rejected = true;
  });
  await vi.waitFor(() => expect(rejected || !!handler.getSignRequest('public')).toBe(true));
  try {
    expect(rejected).toBe(true);
    expect(handler.numSubstrateRequests).toBe(0);
  } finally {
    handler.getSignRequest('public')?.reject(new Error('Fixture cleanup'));
    await result;
  }
}
function extrinsic(): SignerPayloadJSON {
  const genesisHash = `0x${'11'.repeat(32)}` as const;
  return {
    address: alice.address,
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
  };
}
async function admitExtrinsic(mobile = false) {
  if (mobile) Object.assign(records[0].meta, { isMobile: true, wcTopic: 'public-topic' });
  const payload = extrinsic();
  const result = handler.sign(
    url,
    new RequestExtrinsicSign(payload),
    { address: alice.address } as AccountJson,
    'public'
  );
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(handler.getSignRequest('public')).toBeDefined());
  return { result, payload, queued: handler.getSignRequest('public')! };
}
describe('Substrate reviewed account and actual signing key', () => {
  it('rejects an extrinsic for a different account-bound genesis hash', async () => {
    records[0].meta.genesisHash = `0x${'22'.repeat(32)}`;
    let rejected = false;
    const result = handler
      .sign(url, new RequestExtrinsicSign(extrinsic()), { address: alice.address } as AccountJson, 'public')
      .catch(() => {
        rejected = true;
      });
    await vi.waitFor(() => expect(rejected || !!handler.getSignRequest('public')).toBe(true));
    try {
      expect(rejected).toBe(true);
    } finally {
      handler.getSignRequest('public')?.reject(new Error('Fixture cleanup'));
      await result;
    }
  });
  it('accepts the matching account-bound genesis without case sensitivity for hexadecimal', async () => {
    records[0].meta.genesisHash = extrinsic().genesisHash.toUpperCase();
    const { result } = await admitExtrinsic();
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    await result;
  });
  it.each(['unsupported type', 'invalid public key', 'wrong raw address', 'wrong address'])(
    'rejects a key with %s at admission',
    async (change) => {
      selected = {
        ...alice,
        ...(change === 'unsupported type' ? { type: 'unsupported' as KeyringPair['type'] } : {}),
        ...(change === 'invalid public key' ? { publicKey: new Uint8Array(0) } : {}),
        ...(change === 'wrong raw address' ? { addressRaw: bob.addressRaw } : {}),
        ...(change === 'wrong address' ? { address: bob.address } : {}),
      };
      await rejectedAdmission();
    }
  );
  it.each(['isMobile', 'isExternal', 'isHardware'])('rejects a malformed %s classification', async (flag) => {
    records[0].meta[flag] = 'false';
    await rejectedAdmission();
  });
  it('keeps private signer context out of published requests', async () => {
    const { queued } = await admit();
    expect(queued).toHaveProperty('signingAccount.key.type', 'sr25519');
    expect(handler.signSubject.value[0]).not.toHaveProperty('signingAccount');
    delete queued.signingAccount;
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
  });
  it('rejects a watch-only account without an explicit external signer flag', async () => {
    vi.mocked(state.keyringService.getPair).mockReturnValue(null);
    await rejectedAdmission();
  });
  it('keeps an explicitly external account out of the local signing path', async () => {
    records[0].meta.isExternal = true;
    await admit();
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
  });
  it('rejects a different payload account before queue publication', async () => {
    await rejectedAdmission(bob.address);
  });
  it('rejects an invalid case-folded SS58 address', async () => {
    await rejectedAdmission(alice.address.toLowerCase());
  });
  it('rejects a missing current account even if getPair can return a key', async () => {
    records = [];
    await rejectedAdmission();
  });
  it('rejects duplicate decoded account identities', async () => {
    records.push({
      ...records[0],
      address: encodeAddress(alice.publicKey, 0),
      meta: { isMobile: true, wcTopic: 'other' },
    });
    await rejectedAdmission();
  });
  it('rejects a record whose public key disagrees with its address', async () => {
    records[0].publicKey = bob.publicKey;
    await rejectedAdmission();
  });
  it('rejects a substituted pair at admission', async () => {
    selected = bob;
    await rejectedAdmission();
  });
  it('uses the current stored label in the review', async () => {
    await admit();
    expect(handler.signSubject.value[0].account.name).toBe('Stored public account');
  });
  it.each(['removed', 'label', 'mobile', 'external', 'hardware', 'public key', 'ecosystem'])(
    'invalidates a changed %s record before signing',
    async (change) => {
      const { queued } = await admit();
      const resolve = vi.spyOn(queued, 'resolve');
      if (change === 'removed') records = [];
      if (change === 'label') records[0].meta.name = 'Replacement';
      if (change === 'mobile') Object.assign(records[0].meta, { isMobile: true, wcTopic: 'replacement' });
      if (change === 'external') records[0].meta.isExternal = true;
      if (change === 'hardware') records[0].meta.isHardware = true;
      if (change === 'public key') records[0].publicKey = bob.publicKey;
      if (change === 'ecosystem') records[0].meta.walletEcosystem = 'solana';
      if (change === 'removed') {
        await expect(extension.signingApprove({ id: 'public' })).rejects.toThrow('recovery-only');
      } else {
        expect(await extension.signingApprove({ id: 'public' })).toBe(false);
      }
      expect(resolve).not.toHaveBeenCalled();
      expect(state.walletConnectDappService.onRequest).not.toHaveBeenCalled();
    }
  );
  it('rejects a substituted pair after admission before calling sign', async () => {
    const { queued } = await admit();
    selected = bob;
    const sign = vi.spyOn(bob, 'sign');
    const resolve = vi.spyOn(queued, 'resolve');
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(sign).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rejects changed key type even for the same account bytes', async () => {
    await admit();
    selected = { ...alice, type: 'ed25519', sign: alice.sign };
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
  });
  it('checks actual identity again after unlocking a locked pair', async () => {
    let unlocked = false;
    const sign = vi.fn(() => bob.sign(wrapBytes('0x1234')));
    selected = {
      ...alice,
      get isLocked() {
        return !unlocked;
      },
      get address() {
        return unlocked ? bob.address : alice.address;
      },
      get addressRaw() {
        return unlocked ? bob.addressRaw : alice.addressRaw;
      },
      get publicKey() {
        return unlocked ? bob.publicKey : alice.publicKey;
      },
      sign,
    };
    vi.mocked(state.keyringService.unlockPair).mockImplementation(() => {
      unlocked = true;
      return true;
    });
    await admit();
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(sign).not.toHaveBeenCalled();
  });
  it('does not release a mismatched result from a signer with matching public metadata', async () => {
    await admit();
    vi.spyOn(alice, 'sign').mockImplementation((bytes) => bob.sign(bytes));
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
  });
  it.each(['local', 'external'])('rechecks account records after the %s phishing await', async (route) => {
    const { queued } = await admit();
    const resolve = vi.spyOn(queued, 'resolve');
    let finish!: (value: boolean) => void;
    mocks.denied.mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = (
      route === 'local'
        ? extension.signingApprove({ id: 'public' })
        : extension.signingApproveSignature({ id: 'public', signature: u8aToHex(alice.sign(wrapBytes('0x1234'))) })
    ).catch(() => false);
    records[0].meta.name = 'Replaced while waiting';
    finish(false);
    expect(await pending).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('does not release a delayed signature after account replacement', async () => {
    const { queued } = await admit();
    let finish!: (value: { signature: `0x${string}` }) => void;
    const sign = vi.spyOn(queued.request, 'sign').mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    records[0].meta.name = 'Replaced after signing';
    finish({ signature: u8aToHex(alice.sign(wrapBytes('0x1234'))) });
    expect(await pending).toBe(false);
  });
  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)(
    'preserves real %s signing and decoded prefix aliases',
    async (type) => {
      alice = selected = new Keyring({ type }).addFromUri(type === 'ethereum' ? `0x${'11'.repeat(32)}` : '//Alice');
      records = [
        { address: alice.address, publicKey: decodeAddress(alice.address), meta: { name: 'Stored public account', walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
      ];
      const address =
        type === 'ethereum' ? alice.address.toLowerCase() : encodeAddress(decodeAddress(alice.address), 0);
      const { result } = await admit(address);
      expect(await extension.signingApprove({ id: 'public' })).toBe(true);
      expect(
        signatureVerify(
          wrapBytes('0x1234'),
          (await result).payload,
          type === 'ethereum' ? alice.address : alice.publicKey
        ).isValid
      ).toBe(true);
    }
  );
  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)(
    'preserves real local %s extrinsic signing',
    async (type) => {
      alice = selected = new Keyring({ type }).addFromUri(type === 'ethereum' ? `0x${'11'.repeat(32)}` : '//Alice');
      records = [
        { address: alice.address, publicKey: decodeAddress(alice.address), meta: { name: 'Stored public account', walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
      ];
      const { result, payload } = await admitExtrinsic();
      expect(await extension.signingApprove({ id: 'public' })).toBe(true);
      const registry = new TypeRegistry();
      registry.setSignedExtensions(payload.signedExtensions);
      const message = registry.createType('ExtrinsicPayload', payload, { version: 4 }).toU8a(true);
      expect(signatureVerify(message, (await result).payload, alice.address).isValid).toBe(true);
    }
  );
  it.each(['valid', 'wrong key', 'wrong nonce', 'empty'])(
    'verifies a %s mobile-returned extrinsic signature',
    async (change) => {
      const { result, payload, queued } = await admitExtrinsic(true);
      const registry = new TypeRegistry();
      registry.setSignedExtensions(payload.signedExtensions);
      const signature =
        change === 'empty'
          ? '0x'
          : registry
              .createType(
                'ExtrinsicPayload',
                { ...payload, nonce: change === 'wrong nonce' ? '0x03' : payload.nonce },
                { version: 4 }
              )
              .sign(change === 'wrong key' ? bob : alice).signature;
      vi.mocked(state.walletConnectDappService.onRequest).mockResolvedValueOnce({ signature });
      const resolve = vi.spyOn(queued, 'resolve');
      expect(await extension.signingApprove({ id: 'public' })).toBe(change === 'valid');
      expect(state.walletConnectDappService.onRequest).toHaveBeenCalledWith(
        payload,
        queued.signingAccount!.mobileSession,
        expect.any(Function)
      );
      if (change === 'valid') expect((await result).payload).toBe(signature);
      else expect(resolve).not.toHaveBeenCalled();
    }
  );
  it('invalidates a changed mobile account topic after transport returns', async () => {
    const { queued } = await admitExtrinsic(true);
    const resolve = vi.spyOn(queued, 'resolve');
    let finish!: (value: { signature: `0x${string}` }) => void;
    vi.mocked(state.walletConnectDappService.onRequest).mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await vi.waitFor(() => expect(finish).toBeDefined());
    records[0].meta.wcTopic = 'replacement-topic';
    finish({ signature: '0x' });
    expect(await pending).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('does not let mobile transport mutate the reviewed extrinsic', async () => {
    const { queued } = await admitExtrinsic(true);
    const resolve = vi.spyOn(queued, 'resolve');
    vi.mocked(state.walletConnectDappService.onRequest).mockImplementationOnce(async (payload) => {
      if (!('genesisHash' in payload)) throw new Error('Expected extrinsic fixture');
      payload.nonce = '0x03';
      const registry = new TypeRegistry();
      registry.setSignedExtensions(payload.signedExtensions);
      return registry.createType('ExtrinsicPayload', payload, { version: 4 }).sign(alice);
    });
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect((queued.request.payload as SignerPayloadJSON).nonce).toBe('0x02');
    expect(resolve).not.toHaveBeenCalled();
  });
});
