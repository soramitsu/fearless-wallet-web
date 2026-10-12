import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, getBytes, verifyMessage } from 'ethers';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AuthUrls } from '@extension-base/background/types/types';

const storage = vi.hoisted(() => ({
  data: {} as AuthUrls,
  delayed: false,
  delayReads: false,
  reads: [] as Array<(value: AuthUrls) => void>,
  writes: [] as Array<{ value: AuthUrls; finish: () => void }>,
}));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    get(_key: string, callback: (value: AuthUrls) => void) {
      if (storage.delayReads) storage.reads.push(callback);
      else callback(storage.data);
    }
    set(_key: string, value: AuthUrls, callback?: () => void) {
      const finish = () => {
        storage.data = structuredClone(value);
        callback?.();
      };
      storage.writes.push({ value, finish });
      if (!storage.delayed) finish();
    }
  },
}));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public, unfunded fixture. The real authorization/queue/signing code uses no network.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const address = wallet.address;
const url = 'https://public.example';
const grant = (isAllowed = true) =>
  ({
    [url]: {
      id: 'public-grant',
      count: 0,
      isAllowed,
      origin: url,
      url,
      evmAuthorizedAccount: address,
      currentEvmNetworkKey: 'Ethereum',
      authorizedAccounts: [],
      allowedAccountsMap: {},
    },
  }) as AuthUrls;
let state: State, auth: AuthRequestHandler, queue: EvmRequestHandler, extension: Extension;
beforeEach(() => {
  storage.data = grant();
  storage.delayed = false;
  storage.delayReads = false;
  storage.reads = [];
  storage.writes = [];
  const requests = { popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService;
  queue = new EvmRequestHandler(requests);
  state = {
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
    requestService: { evmRequestHandler: queue, getSignRequest: (id: string) => queue.getEvmSignRequest(id) },
    getAuthInfo: vi.fn(async () => (await auth.getAuthList())[url]),
    getEvmAuthorizationSnapshot: () => auth.getEvmAuthorizationSnapshot(url),
    getEvmApi: vi.fn(() => undefined),
    keyringService: {
      getSubstrateAddress: () => 'root',
      getEthereumAddress: () => address,
      getAllAccounts: () => [{ address: 'root', meta: { name: 'Public fixture', ethereumAddress: address } }],
      getAddresses: () => [],
      isMobileAccount: () => false,
      accountExportPrivateKey: vi.fn(() => ({ privateKey: wallet.privateKey })),
    },
  } as unknown as State;
  auth = new AuthRequestHandler(requests, state);
  extension = new Extension(state);
});
afterEach(() => vi.restoreAllMocks());
async function admit() {
  const params = ['0x1234', address];
  const context = await captureEvmSigningContext(state, url, 'personal_sign', params);
  const result = queue.confirmSign('public-request', url, 'personal_sign', params, context);
  return { result, request: queue.getEvmSignRequest('public-request') };
}

describe('EVM site-grant revision and asynchronous storage boundaries', () => {
  it.each(['revocation', 'account', 'network', 'removal', 'identity'])(
    'rejects a queued approval after a changed-away-and-back %s',
    async (change) => {
      await admit();
      const changed = grant();
      if (change === 'revocation') changed[url].isAllowed = false;
      if (change === 'account') changed[url].evmAuthorizedAccount = `0x${'22'.repeat(20)}`;
      if (change === 'network') changed[url].currentEvmNetworkKey = 'Other';
      if (change === 'removal') delete changed[url];
      if (change === 'identity') changed[url].id = 'replacement';
      auth.setAuthorize(changed);
      auth.setAuthorize(grant());
      await expect(extension.signEvmApprove({ id: 'public-request' })).rejects.toThrow();
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    }
  );
  it('does not restore an obsolete initial storage read after an immediate revocation', async () => {
    storage.delayReads = true;
    auth = new AuthRequestHandler({ popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService, state);
    const pending = admit();
    const rejected = expect(pending).rejects.toThrow();
    auth.setAuthorize(grant(false));
    storage.reads[0](grant());
    await rejected;
    await expect(admit()).rejects.toThrow();
  });
  it('refuses an old queued context without a grant revision', async () => {
    const { request } = await admit();
    delete request.authorizationRevision;
    await expect(extension.signEvmApprove({ id: 'public-request' })).rejects.toThrow('context changed');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('rejects changed-away-and-back grants while a signature is pending', async () => {
    const { request } = await admit();
    const resolve = vi.spyOn(request, 'resolve');
    let finish!: (value: string) => void;
    const sign = vi.spyOn(Wallet.prototype, 'signMessage').mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = extension.signEvmApprove({ id: 'public-request' });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    auth.setAuthorize(grant(false));
    auth.setAuthorize(grant());
    finish('0x1234');
    await expect(pending).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });
  it('uses the current grant after a delayed authorization read', async () => {
    let finish!: (value: AuthUrls[string]) => void;
    vi.mocked(state.getAuthInfo).mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = admit();
    auth.setAuthorize(grant(false));
    finish(grant()[url]);
    await expect(pending).rejects.toThrow();
    expect(queue.numEvmSignRequest).toBe(0);
  });
  it('enforces revocation immediately while persistence is pending', async () => {
    storage.delayed = true;
    auth.setAuthorize(grant(false));
    await expect(admit()).rejects.toThrow();
    expect(queue.numEvmSignRequest).toBe(0);
  });
  it('never lets an older write callback restore an obsolete cached grant', async () => {
    storage.delayed = true;
    auth.setAuthorize(grant());
    auth.setAuthorize(grant(false));
    storage.writes[0].finish();
    await expect(admit()).rejects.toThrow();
  });
  it('copies authorization values before handing them to the serialized storage queue', async () => {
    storage.delayed = true;
    const value = grant(false);
    auth.setAuthorize(value);
    value[url].isAllowed = true;
    storage.writes[0].finish();
    expect(storage.data[url].isAllowed).toBe(false);
    await expect(admit()).rejects.toThrow();
  });
  it('tracks in-place changes made through the existing cached-list API', async () => {
    await admit();
    const value = await auth.getAuthList();
    value[url].isAllowed = false;
    auth.setAuthorize(value);
    value[url].isAllowed = true;
    auth.setAuthorize(value);
    await expect(extension.signEvmApprove({ id: 'public-request' })).rejects.toThrow();
  });
  it('isolates a pending storage write from later cached-list edits', async () => {
    storage.delayed = true;
    auth.setAuthorize(grant(false));
    const value = await auth.getAuthList();
    value[url].isAllowed = true;
    storage.writes[0].finish();
    expect(storage.data[url].isAllowed).toBe(false);
  });
  it('does not let a read-only grant consumer authorize a denied origin by mutating its snapshot', async () => {
    auth.setAuthorize(grant(false));
    const value = await auth.getAuthList();
    value[url].isAllowed = true;
    await expect(admit()).rejects.toThrow();
  });
  it('keeps an unchanged grant valid when another origin is updated', async () => {
    const { result } = await admit();
    auth.setAuthorize({ ...grant(), 'https://other.example': { ...grant()[url], isAllowed: false } });
    await expect(extension.signEvmApprove({ id: 'public-request' })).resolves.toBe(true);
    expect(verifyMessage(getBytes('0x1234'), (await result).payload)).toBe(address);
  });
});
