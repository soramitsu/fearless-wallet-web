/**
 * @jest-environment node
 */
// pub(decrypt.cosigner) and pub(encrypt.cosigner) use one account's secret key without a confirmation popup. A site
// may only name an account the user shared with it (security audit 2026-10-22, AUDIT-01). These tests drive the real
// Tabs dispatcher and AuthRequestHandler; the keyring is a stub, no key is ever loaded.
import { encodeAddress } from '@polkadot/util-crypto';
import Tabs from '../../src/extension/background/extension-base/src/background/handlers/Tabs';
import { AuthRequestHandler } from '../../src/extension/background/extension-base/src/services/request-service/handlers/AuthRequestHandler';
import type State from '../../src/extension/background/extension-base/src/background/handlers/State';
import type {
  AuthUrls,
  DecryptForCosignerData,
  EncryptByCosignerData,
  Port,
} from '../../src/extension/background/extension-base/src/background/types/types';
import type { RequestService } from '../../src/extension/background/extension-base/src/services';

const mockStore: { authUrls: AuthUrls } = { authUrls: {} };

// Tabs also imports the signing, EVM and phishing modules, which load the background singleton and the EVM
// libraries. None of them is on the cosigner path; stub them so only the dispatcher and the authorization run.
jest.mock('@extension-base/background/handlers', () => ({ state: {} }));
jest.mock('@extension-base/signers/RequestExtrinsicSign', () => ({ __esModule: true, default: class {} }));
jest.mock('@extension-base/signers/RequestBytesSign', () => ({ __esModule: true, default: class {} }));
jest.mock('../../src/extension/background/extension-base/src/services/eip-service', () => ({ EipService: class {} }));
jest.mock('@polkadot/phishing', () => ({ checkIfDenied: jest.fn() }));
// src/helpers is UI code (clipboard, formatting); the authorization handler only uses isSameString from it.
jest.mock('@/helpers', () => ({
  isSameString: (a?: string, b?: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

jest.mock('@extension-base/stores/Authorize', () => ({
  __esModule: true,
  default: class {
    get(_key: string, update: (value: AuthUrls) => void): void {
      update(mockStore.authUrls);
    }
  },
}));

// The store keys sites by host (stripUrl), as the wallet writes them when the user connects a site.
const HOST = 'cosigner-test.example';
const ORIGIN = `https://${HOST}`;
// Synthetic public keys; nothing here belongs to a real wallet.
const SHARED = encodeAddress(new Uint8Array(32).fill(1), 42);
const SHARED_OTHER_FORMAT = encodeAddress(new Uint8Array(32).fill(1), 69);
const NOT_SHARED = encodeAddress(new Uint8Array(32).fill(2), 42);

function createTabs() {
  const keyringService = {
    encodeAddress: (address: string) => encodeAddress(address, 42),
    getAllSubstrateAccounts: () => [{ address: SHARED }],
    decryptForCosigner: jest.fn().mockReturnValue({ result: 'decrypted' }),
    encryptByCosigner: jest.fn().mockReturnValue({ result: 'encrypted' }),
  };
  const state = { keyringService, requestService: {} as RequestService };
  const authorization = new AuthRequestHandler({} as RequestService, state as unknown as State);

  state.requestService = {
    ensureUrlAuthorized: authorization.ensureUrlAuthorized.bind(authorization),
    ensureAccountAuthorized: authorization.ensureAccountAuthorized.bind(authorization),
  } as unknown as RequestService;

  return { tabs: new Tabs(state as unknown as State), keyringService };
}

describe('3.0.6: cosigner requests are limited to the accounts shared with the site', () => {
  beforeEach(() => {
    mockStore.authUrls = {
      [HOST]: {
        id: HOST,
        url: ORIGIN,
        origin: 'Cosigner test dApp',
        count: 0,
        isAllowed: true,
        authorizedAccounts: [SHARED],
        evmAuthorizedAccount: '',
        allowedAccountsMap: {},
      },
    } as unknown as AuthUrls;
  });

  for (const operation of ['decrypt', 'encrypt'] as const) {
    const message = operation === 'decrypt' ? 'pub(decrypt.cosigner)' : 'pub(encrypt.cosigner)';
    const method = operation === 'decrypt' ? 'decryptForCosigner' : 'encryptByCosigner';
    const request = (address: string): DecryptForCosignerData | EncryptByCosignerData =>
      operation === 'decrypt'
        ? ({ address, data: {}, encryptorPublicKey: new Uint8Array([1]) } as unknown as DecryptForCosignerData)
        : ({ address, data: 'payload', cosigners: {} } as unknown as EncryptByCosignerData);
    const handle = (tabs: Tabs, address: string, url = ORIGIN) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tabs.handle('test', message as any, request(address) as any, url, {} as Port);

    it(`${operation}: rejects an account the site was not given`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, NOT_SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a site the user disallowed`, async () => {
      (mockStore.authUrls[HOST] as { isAllowed: boolean }).isAllowed = false;
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a site that was never enabled`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED, 'https://other-site.example')).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects after the account grant was revoked`, async () => {
      (mockStore.authUrls[HOST] as { authorizedAccounts: string[] }).authorizedAccounts = [];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects an old entry without an account list`, async () => {
      delete (mockStore.authUrls[HOST] as { authorizedAccounts?: string[] }).authorizedAccounts;
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a malformed address`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, 'not-an-address')).rejects.toThrow(/invalid/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a missing requested address`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, undefined as unknown as string)).rejects.toThrow(/invalid/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a malformed account grant`, async () => {
      (mockStore.authUrls[HOST] as { authorizedAccounts: string[] }).authorizedAccounts = [
        'not-an-address',
        undefined as unknown as string,
      ];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: requires an explicitly enabled origin`, async () => {
      delete (mockStore.authUrls[HOST] as { isAllowed?: boolean }).isAllowed;
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: allows the shared account`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).resolves.toEqual({ result: `${operation}ed` });
      expect(keyringService[method]).toHaveBeenCalledTimes(1);
      expect(keyringService[method]).toHaveBeenCalledWith(request(SHARED));
    });

    it(`${operation}: allows the shared account written in another network format`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED_OTHER_FORMAT)).resolves.toEqual({ result: `${operation}ed` });
      expect(keyringService[method]).toHaveBeenCalledTimes(1);
    });

    it(`${operation}: normalizes a grant stored in another network format`, async () => {
      (mockStore.authUrls[HOST] as { authorizedAccounts: string[] }).authorizedAccounts = [
        'not-an-address',
        SHARED_OTHER_FORMAT,
      ];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).resolves.toEqual({ result: `${operation}ed` });
      expect(keyringService[method]).toHaveBeenCalledTimes(1);
    });
  }
});
