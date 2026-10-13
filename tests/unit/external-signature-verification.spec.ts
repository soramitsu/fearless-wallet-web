import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, getBytes } from 'ethers';
import { Keyring } from '@polkadot/keyring';
import { TypeRegistry } from '@polkadot/types';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import Extension from '@extension-base/background/handlers/Extension';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson, RequestSign } from '@extension-base/background/types/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public unfunded development keys; real cryptography and queues, no transports.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const otherWallet = new Wallet(`0x${'22'.repeat(32)}`);
const url = 'https://public.example';
let state: State, extension: Extension, evm: EvmRequestHandler, substrate: SubstrateRequestHandler;
beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(() => {
  const service = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: {
      getSigningAuthorizationRevision: () => 0,
      assertSigningAuthorization: vi.fn(),
    },
    knownMetadata: [],
  } as unknown as RequestService;
  state = {
    requestService: service,
    getAuthInfo: async () => ({}),
    getEvmAuthorizationSnapshot: () => ({
      authorization: {
        isAllowed: true,
        evmAuthorizedAccount: wallet.address,
        currentEvmNetworkKey: 'Ethereum',
      },
      revision: 0,
    }),
    networkService: {
      networkMap: {
        Ethereum: {
          name: 'Ethereum',
          chainId: '1',
          genesisHash: '0x1234',
          ecosystem: 'ethereum',
          disabled: false,
          assets: [],
        },
      },
    },
    keyringService: {
      getSubstrateAddress: () => 'public-root',
      getEthereumAddress: () => wallet.address,
      getAllAccounts: () => [{ address: 'public-root', meta: { name: 'Public fixture' } }],
      getAddresses: () => [],
      isMobileAccount: () => false,
      accountExportPrivateKey: vi.fn(),
      exportMnemonic: vi.fn(),
      getPair: vi.fn(),
    },
  } as unknown as State;
  Object.assign(service.authRequestHandler, { getEvmAuthorizationSnapshot: (origin: string) => state.getEvmAuthorizationSnapshot(origin) });
  evm = new EvmRequestHandler(service);
  substrate = new SubstrateRequestHandler(service, state);
  Object.assign(service, {
    evmRequestHandler: evm,
    substrateRequestHandler: substrate,
    getSignRequest: (id: string) => evm.getEvmSignRequest(id) ?? substrate.getSignRequest(id),
  });
  extension = new Extension(state);
});
async function admitEvm(method: string, params: unknown[]) {
  const context = await captureEvmSigningContext(state, url, method, params);
  const result = evm.confirmSign('public', url, method, params, context);
  void result.catch(() => undefined);
  return { result, queued: evm.getEvmSignRequest('public')! };
}
async function admitSubstrate(signer: RequestSign, address: string) {
  Object.assign(state.keyringService, {
    getAllAccounts: () => [
      { address, publicKey: decodeAddress(address), meta: { isExternal: true, name: 'Public fixture' } },
    ],
  });
  const result = substrate.sign(url, signer, { address, name: 'Public fixture' } as AccountJson, 'public');
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(substrate.getSignRequest('public')).toBeDefined());
  return { result, queued: substrate.getSignRequest('public')! };
}
async function approve(signature: string) {
  return extension.signingApproveSignature({ id: 'public', signature: signature as HexString });
}
async function rejectsSignature(signature: string, queued: { resolve: (...args: never[]) => void }) {
  const resolve = vi.spyOn(queued, 'resolve');
  await expect(approve(signature)).rejects.toThrow();
  expect(resolve).not.toHaveBeenCalled();
  expect(state.requestService.getSignRequest('public')).toBeUndefined();
  expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
  expect(state.keyringService.getPair).not.toHaveBeenCalled();
}
const typed = () => ({
  domain: { name: 'Public fixture', chainId: 1 },
  primaryType: 'Consent',
  types: { Consent: [{ name: 'enabled', type: 'bool' }] },
  message: { enabled: false },
});
describe('external EVM signatures', () => {
  it.each(['personal_sign', 'eth_sign'])('accepts an exact %s byte signature', async (method) => {
    const bytes = '0xff0080';
    const { result } = await admitEvm(
      method,
      method === 'personal_sign' ? [bytes, wallet.address] : [wallet.address, bytes]
    );
    const signature = await wallet.signMessage(getBytes(bytes));
    expect(await approve(signature)).toBe(true);
    expect((await result).payload).toBe(signature);
  });
  it.each(['wrong key', 'wrong bytes', 'hex text', 'malformed'])('rejects %s', async (kind) => {
    const { queued } = await admitEvm('personal_sign', ['0xff0080', wallet.address]);
    const signature =
      kind === 'malformed'
        ? '0x1234'
        : await (kind === 'wrong key' ? otherWallet : wallet).signMessage(
            kind === 'hex text' ? '0xff0080' : getBytes(kind === 'wrong bytes' ? '0xff0081' : '0xff0080')
          );
    await rejectsSignature(signature, queued);
  });
  it.each(['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'])('accepts exact %s', async (method) => {
    const data = typed();
    const { result } = await admitEvm(method, [wallet.address, JSON.stringify(data)]);
    const signature = await wallet.signTypedData(data.domain, data.types, data.message);
    expect(await approve(signature)).toBe(true);
    expect((await result).payload).toBe(signature);
  });
  it.each(['domain', 'message', 'key'])('rejects typed-data %s substitution', async (change) => {
    const data = typed();
    const { queued } = await admitEvm('eth_signTypedData_v4', [wallet.address, data]);
    const signature = await (change === 'key' ? otherWallet : wallet).signTypedData(
      change === 'domain' ? { ...data.domain, chainId: 2 } : data.domain,
      data.types,
      change === 'message' ? { enabled: true } : data.message
    );
    await rejectsSignature(signature, queued);
  });
  it('does not treat an unverified transaction hash as a signature completion', async () => {
    const { queued } = await admitEvm('eth_sendTransaction', [
      { from: wallet.address, to: otherWallet.address, value: '0x1' },
    ]);
    await rejectsSignature(`0x${'33'.repeat(32)}`, queued);
  });
});
describe('external Substrate signatures', () => {
  it.each(['sr25519', 'ed25519', 'ecdsa'] as const)('accepts exact wrapped raw bytes for %s', async (type) => {
    const pair = new Keyring({ type }).addFromUri('//Alice');
    const { result } = await admitSubstrate(
      new RequestBytesSign({ address: pair.address, data: '0xff0080', type: 'bytes' }),
      pair.address
    );
    const signature = u8aToHex(pair.sign(wrapBytes('0xff0080')));
    expect(await approve(signature)).toBe(true);
    expect((await result).payload).toBe(signature);
  });
  it.each(['wrong key', 'wrong bytes', 'unwrapped', 'malformed'])('rejects raw %s', async (change) => {
    const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
    const other = new Keyring({ type: 'sr25519' }).addFromUri('//Bob');
    const { queued } = await admitSubstrate(
      new RequestBytesSign({
        address: pair.address,
        data: '0xff0080',
        type: 'bytes',
      }),
      pair.address
    );
    const signature =
      change === 'malformed'
        ? '0x1234'
        : u8aToHex(
            (change === 'wrong key' ? other : pair).sign(
              change === 'unwrapped'
                ? hexToU8a('0xff0080')
                : wrapBytes(change === 'wrong bytes' ? '0xff0081' : '0xff0080')
            )
          );
    await rejectsSignature(signature, queued);
  });
  it('rejects a mismatched raw payload account at admission', async () => {
    const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
    const other = new Keyring({ type: 'sr25519' }).addFromUri('//Bob');
    await expect(
      substrate.sign(url, new RequestBytesSign({ address: other.address, data: '0xff0080', type: 'bytes' }), {
        address: pair.address,
      } as AccountJson)
    ).rejects.toThrow('payload account');
    expect(substrate.numSubstrateRequests).toBe(0);
  });
  for (const type of ['sr25519', 'ed25519', 'ecdsa'] as const) {
    it.each([2, 255, 256, 300])(`accepts exact ${type} extrinsic payload (%i method bytes)`, async (length) => {
      const pair = new Keyring({ type }).addFromUri('//Alice');
      const payload: SignerPayloadJSON = {
        address: pair.address,
        genesisHash: `0x${'00'.repeat(32)}`,
        blockHash: `0x${'00'.repeat(32)}`,
        blockNumber: '0x00',
        era: '0x00',
        specVersion: '0x01',
        transactionVersion: '0x01',
        tip: '0x00',
        method: `0x${'11'.repeat(length)}`,
        signedExtensions: ['CheckNonce'],
        nonce: '0x02',
        version: 4,
      };
      const { result } = await admitSubstrate(new RequestExtrinsicSign(payload), pair.address);
      const registry = new TypeRegistry();
      registry.setSignedExtensions(payload.signedExtensions);
      const { signature } = registry.createType('ExtrinsicPayload', payload, { version: 4 }).sign(pair);
      expect(await approve(signature)).toBe(true);
      expect((await result).payload).toBe(signature);
    });
  }
  it.each(['nonce', 'method', 'wrong key', 'wrong enum', 'wrapped'])(
    'rejects extrinsic %s substitution',
    async (change) => {
      const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
      const payload: SignerPayloadJSON = {
        address: pair.address,
        genesisHash: `0x${'00'.repeat(32)}`,
        blockHash: `0x${'00'.repeat(32)}`,
        blockNumber: '0x00',
        era: '0x00',
        specVersion: '0x01',
        transactionVersion: '0x01',
        tip: '0x00',
        method: '0x1234',
        signedExtensions: ['CheckNonce'],
        nonce: '0x02',
        version: 4,
      };
      const { queued } = await admitSubstrate(new RequestExtrinsicSign(payload), pair.address);
      const registry = new TypeRegistry();
      registry.setSignedExtensions(payload.signedExtensions);
      const encoded = registry.createType(
        'ExtrinsicPayload',
        {
          ...payload,
          ...(change === 'nonce' ? { nonce: '0x03' } : {}),
          ...(change === 'method' ? { method: '0xabcd' } : {}),
        },
        { version: 4 }
      );
      let signature =
        change === 'wrapped'
          ? u8aToHex(pair.sign(wrapBytes(encoded.toU8a(true)), { withType: true }))
          : encoded.sign(change === 'wrong key' ? new Keyring({ type: 'sr25519' }).addFromUri('//Bob') : pair)
              .signature;
      if (change === 'wrong enum') signature = `0x00${signature.slice(4)}`;
      await rejectsSignature(signature, queued);
    }
  );
});
