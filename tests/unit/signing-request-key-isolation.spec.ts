import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, encodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { RequestService } from '@extension-base/services/request-service';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { createSigningRequestId } from '@extension-base/services/request-service/signingRequestId';
import { EipService } from '@extension-base/services/eip-service';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import type State from '@extension-base/background/handlers/State';
import type { AccountJson, AuthUrls, Port } from '@extension-base/background/types/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const storage = vi.hoisted(() => ({ data: {} as AuthUrls }));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    getAndWait(): Promise<AuthUrls> {
      return Promise.resolve(storage.data);
    }
    setAndWait(_key: string, value: AuthUrls): Promise<void> {
      storage.data = structuredClone(value);
      return Promise.resolve();
    }
  },
}));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public development keys and unfunded fixtures. Nothing here reaches a network.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const shownSite = 'https://shown.example';
const otherSite = 'https://other.example';
let alice: ReturnType<Keyring['addFromUri']>;

beforeAll(async () => {
  await cryptoWaitReady();
  alice = new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri('//Alice');
});

const grant = (url: string, substrate: string[], evm: string): AuthUrls[string] => ({
  id: `grant:${url}`,
  count: 0,
  isAllowed: true,
  origin: url,
  url,
  authorizedAccounts: substrate,
  evmAuthorizedAccount: evm,
  currentEvmNetworkKey: 'Ethereum',
  allowedAccountsMap: {},
});

let state: State, requests: RequestService, extension: Extension, evm: EvmRequestHandler, substrate: SubstrateRequestHandler;
let exportKey: ReturnType<typeof vi.fn>, getEvmApi: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  // Both sites hold a Substrate and an EVM grant, as a multi-chain dApp does.
  storage.data = {
    [shownSite]: grant(shownSite, [alice.address], wallet.address),
    [otherSite]: grant(otherSite, [alice.address], wallet.address),
  };
  exportKey = vi.fn(() => ({ privateKey: wallet.privateKey }));
  getEvmApi = vi.fn(() => undefined);
  requests = Object.create(RequestService.prototype) as RequestService;
  // A wallet created by this version (the recovery-only policy would refuse an older one before any signing).
  const record = {
    address: alice.address,
    publicKey: alice.publicKey,
    meta: { name: 'Public signer', ethereumAddress: wallet.address, walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION },
  };
  state = {
    requestService: requests,
    networkService: {
      networkMap: {
        Ethereum: {
          name: 'Ethereum',
          chainId: '1',
          genesisHash: '0x1234',
          ecosystem: 'ethereum',
          disabled: false,
          currentProvider: 'https://rpc.public.invalid',
          assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
        },
      },
    },
    getAuthInfo: vi.fn(async (url: string) => (await requests.authRequestHandler.getAuthList())[url]),
    getEvmAuthorizationSnapshot: (url: string) => requests.authRequestHandler.getEvmAuthorizationSnapshot(url),
    getEvmApi,
    keyringService: {
      isResetting: false,
      walletResetRevision: 0,
      tonKeyring: { getAccounts: () => [] },
      encodeAddress: (address: string) => encodeAddress(address, 42),
      getAllAccounts: () => [record],
      getAllSubstrateAccounts: () => [record],
      getAddresses: () => [],
      getAddress: () => record,
      getPair: () => alice,
      getSubstrateAddress: () => alice.address,
      getEthereumAddress: () => wallet.address,
      isMobileAccount: () => false,
      accountExportPrivateKey: exportKey,
    },
  } as unknown as State;
  evm = new EvmRequestHandler(requests);
  substrate = new SubstrateRequestHandler(requests, state);
  Object.defineProperty(requests, 'knownMetadata', { value: [] });
  Object.assign(requests, {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    evmRequestHandler: evm,
    substrateRequestHandler: substrate,
    solanaRequestHandler: new SolanaRequestHandler(requests),
    authRequestHandler: new AuthRequestHandler(requests, state),
  });
  await requests.authRequestHandler.getAuthList();
  extension = new Extension(state);
});
afterEach(() => vi.restoreAllMocks());

it('cancels queued signing across ecosystems without removing saved site grants', async () => {
  const queued = await queueShownMessage();
  const rejectedSubstrate = expect(queued.signing).rejects.toThrow('Wallet locked');
  const context = await captureEvmSigningContext(state, shownSite, 'personal_sign', ['0x12', wallet.address]);
  const signingEvm = evm.confirmSign('expire-evm', shownSite, 'personal_sign', ['0x12', wallet.address], context);
  const rejectedEvm = expect(signingEvm).rejects.toThrow('Wallet locked');
  const grantsBefore = structuredClone(await requests.authRequestHandler.getAuthList());
  requests.cancelSigningRequests();
  await Promise.all([rejectedSubstrate, rejectedEvm]);
  expect(substrate.numSubstrateRequests).toBe(0);
  expect(evm.numEvmSignRequest).toBe(0);
  expect(await requests.authRequestHandler.getAuthList()).toEqual(grantsBefore);
  expect(exportKey).not.toHaveBeenCalled();
});

const signRaw = (data = '0x1234'): { payload: SignerPayloadRaw; account: AccountJson } => ({
  payload: { address: alice.address, data, type: 'bytes' },
  account: { address: alice.address, name: 'Public signer', isMobile: false } as AccountJson,
});

/** A Substrate message request from the shown site, as the popup lists it. */
async function queueShownMessage() {
  const { payload, account } = signRaw();
  const signing = substrate.sign(shownSite, new RequestBytesSign(payload), account);
  void signing.catch(() => undefined);
  await vi.waitFor(() => expect(substrate.numSubstrateRequests).toBe(1));

  return { signing, key: substrate.allSubstrateRequests[0].id };
}

/** The other site's transfer, sent with a page message id it chose to equal `messageId`. */
async function sendHiddenTransfer(messageId: string) {
  const transfer = new EipService(state).handleEvmRequest(messageId, otherSite, {
    method: 'eth_sendTransaction',
    params: [{ from: wallet.address, to: `0x${'22'.repeat(20)}`, value: '0xde0b6b3a7640000' }],
  });
  void transfer.catch(() => undefined);
  await vi.waitFor(() => expect(evm.numEvmSignRequest).toBe(1));

  // Wrapped: an async function returning the promise would make the caller wait for the transfer to settle.
  return { transfer };
}

describe('signing request keys', () => {
  it('are minted by the background, unguessable and tagged with their queue', () => {
    const keys = new Set(Array.from({ length: 50 }, () => createSigningRequestId('substrate')));

    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^substrate\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('never take a page message id, even one equal to another queued request', async () => {
    const { key } = await queueShownMessage();

    await sendHiddenTransfer(key);

    expect(evm.getEvmSignRequest(key)).toBeUndefined();
    const [evmKey] = Object.keys(evm.signEvmSubject.value);
    expect(evmKey).toMatch(/^evm\./);
    expect(evmKey).not.toBe(key);
  });

  it('cannot be reused by another queue', async () => {
    const { key } = await queueShownMessage();
    const params = ['0x1234', wallet.address];
    const context = await captureEvmSigningContext(state, otherSite, 'personal_sign', params);

    await expect(evm.confirmSign(key, otherSite, 'personal_sign', params, context)).rejects.toThrow('Duplicate EVM request ID');
    expect(evm.numEvmSignRequest).toBe(0);
  });
});

describe('approving the request on screen', () => {
  it('signs the shown Substrate message and leaves the other site transfer untouched', async () => {
    const { signing, key } = await queueShownMessage();
    await sendHiddenTransfer(key);

    await expect(extension.signingApprove({ id: key, kind: 'substrate' })).resolves.toBe(true);

    const { payload } = await signing;
    expect(signatureVerify(wrapBytes('0x1234'), payload, alice.publicKey).isValid).toBe(true);
    // The transfer was neither signed nor broadcast: no EVM key was opened and no provider was asked.
    expect(exportKey).not.toHaveBeenCalled();
    expect(getEvmApi).not.toHaveBeenCalled();
    expect(evm.numEvmSignRequest).toBe(1);
  });

  it('only reaches the queue it names', async () => {
    const { key } = await queueShownMessage();
    await sendHiddenTransfer(key);
    const [evmKey] = Object.keys(evm.signEvmSubject.value);

    await expect(extension.signingApprove({ id: evmKey, kind: 'substrate' })).rejects.toThrow('Unable to find request');
    expect(() => extension.signingCancel({ id: evmKey, kind: 'solana' })).toThrow('Unable to find request');
    expect(exportKey).not.toHaveBeenCalled();
    expect(evm.numEvmSignRequest).toBe(1);
    expect(substrate.numSubstrateRequests).toBe(1);
  });

  it('refuses a key held by two queues when the approval does not name one', () => {
    const shared = 'shared-key';
    const service = Object.create(RequestService.prototype) as RequestService;
    const queued = { id: shared };
    Object.assign(service, {
      evmRequestHandler: { getEvmSignRequest: (id: string) => (id === shared ? { ...queued, data: [] } : undefined) },
      solanaRequestHandler: { getSolanaSignRequest: () => undefined },
      substrateRequestHandler: { getSignRequest: (id: string) => (id === shared ? queued : undefined) },
    });

    expect(() => service.getSignRequest(shared)).toThrow('Signing request ID is ambiguous');
    expect(service.getSignRequest(shared, 'substrate')).toBe(queued);
    expect(service.hasSigningRequest(shared)).toBe(true);
  });
});

describe('what a page receives', () => {
  it('gets its signature under its own message id, never the queue key', async () => {
    const { payload } = signRaw('0x5678');
    const port = { sender: { url: shownSite } } as unknown as Port;
    const response = new Tabs(state).handle('page-message-7', 'pub(bytes.sign)', payload, shownSite, port);
    void response.catch(() => undefined);
    await vi.waitFor(() => expect(substrate.numSubstrateRequests).toBe(1));
    const key = substrate.allSubstrateRequests[0].id;

    await extension.signingApprove({ id: key, kind: 'substrate' });
    const result = (await response) as { id: string; payload: `0x${string}` };

    expect(result.id).toBe('page-message-7');
    expect(result.id).not.toBe(key);
    expect(signatureVerify(wrapBytes('0x5678'), result.payload, alice.publicKey).isValid).toBe(true);
  });
});
