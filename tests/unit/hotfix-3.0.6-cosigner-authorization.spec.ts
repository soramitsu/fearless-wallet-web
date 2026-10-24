// pub(decrypt.cosigner) and pub(encrypt.cosigner) use one account's secret key without a confirmation popup. A site
// may only name an account the user shared with it (security audit 2026-10-22, AUDIT-01, fixed in 3.0.6). Ported
// from 3.0.6's tests/unit/hotfix-3.0.6-cosigner-authorization.spec.ts: the real Tabs dispatcher and
// AuthRequestHandler; the keyring is a stub and no key is ever loaded.
import { encodeAddress } from '@polkadot/util-crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import Tabs from '@extension-base/background/handlers/Tabs';
import { RequestService } from '@extension-base/services/request-service';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import type { AuthUrls, DecryptForCosignerData, EncryptByCosignerData, Port } from '@extension-base/background/types/types';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const storage = vi.hoisted(() => ({ data: {} as AuthUrls }));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    getAndWait(): Promise<AuthUrls> {
      return Promise.resolve(structuredClone(storage.data));
    }
    setAndWait(_key: string, value: AuthUrls): Promise<void> {
      storage.data = structuredClone(value);
      return Promise.resolve();
    }
  },
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Grants are keyed by origin (stripUrl), as the wallet writes them when the user connects a site.
const ORIGIN = 'https://cosigner-test.example';
// Synthetic public keys; nothing here belongs to a real wallet.
const SHARED = encodeAddress(new Uint8Array(32).fill(1), 42);
const SHARED_OTHER_FORMAT = encodeAddress(new Uint8Array(32).fill(1), 69);
const NOT_SHARED = encodeAddress(new Uint8Array(32).fill(2), 42);

const grant = (): AuthUrls =>
  ({
    [ORIGIN]: {
      id: ORIGIN,
      url: ORIGIN,
      origin: 'Cosigner test dApp',
      count: 0,
      isAllowed: true,
      authorizedAccounts: [SHARED],
      evmAuthorizedAccount: '',
      allowedAccountsMap: {},
    },
  }) as unknown as AuthUrls;
const entry = () => storage.data[ORIGIN] as unknown as Record<string, unknown>;

function createTabs() {
  const keyringService = {
    encodeAddress: (address: string) => encodeAddress(address, 42),
    getAllSubstrateAccounts: () => [{ address: SHARED }],
    getAllAccounts: () => [{ address: SHARED, meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } }],
    decryptForCosigner: vi.fn(() => ({ result: 'decrypted' })),
    encryptByCosigner: vi.fn(() => ({ result: 'encrypted' })),
  };
  const requests = Object.create(RequestService.prototype) as RequestService;
  Object.assign(requests, { popupOpen: vi.fn(), updateIcon: vi.fn() });
  const state = Object.assign(Object.create(State.prototype), {
    requestService: requests,
    networkService: {},
    keyringService,
  }) as State;
  Object.assign(requests, { authRequestHandler: new AuthRequestHandler(requests, state) });

  return { tabs: new Tabs(state), keyringService };
}

describe('cosigner requests are limited to the accounts shared with the site', () => {
  beforeEach(() => {
    storage.data = grant();
  });

  for (const operation of ['decrypt', 'encrypt'] as const) {
    const message = operation === 'decrypt' ? 'pub(decrypt.cosigner)' : 'pub(encrypt.cosigner)';
    const method = operation === 'decrypt' ? 'decryptForCosigner' : 'encryptByCosigner';
    const request = (address: string): DecryptForCosignerData | EncryptByCosignerData =>
      operation === 'decrypt'
        ? ({ address, data: {}, encryptorPublicKey: new Uint8Array([1]) } as unknown as DecryptForCosignerData)
        : ({ address, data: 'payload', cosigners: {} } as unknown as EncryptByCosignerData);
    const handle = (tabs: Tabs, address: string, url = ORIGIN) =>
      tabs.handle('test', message, request(address) as never, url, {} as Port);

    it(`${operation}: rejects an account the site was not given`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, NOT_SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a shared account that remains recovery-only`, async () => {
      const { tabs, keyringService } = createTabs();
      keyringService.getAllAccounts = () => [{ address: SHARED, meta: { walletSecurityGeneration: 0 } }];

      await expect(handle(tabs, SHARED)).rejects.toThrow(/recovery-only/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a site the user disallowed`, async () => {
      entry().isAllowed = false;
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects a site that was never enabled`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED, 'https://other-site.example')).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects the same host over another scheme`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED, 'http://cosigner-test.example')).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects after the account grant was revoked`, async () => {
      entry().authorizedAccounts = [];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: rejects an old entry without an account list`, async () => {
      delete entry().authorizedAccounts;
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
      entry().authorizedAccounts = ['not-an-address', undefined];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`${operation}: requires an explicitly enabled origin`, async () => {
      delete entry().isAllowed;
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
      entry().authorizedAccounts = ['not-an-address', SHARED_OTHER_FORMAT];
      const { tabs, keyringService } = createTabs();

      await expect(handle(tabs, SHARED)).resolves.toEqual({ result: `${operation}ed` });
      expect(keyringService[method]).toHaveBeenCalledTimes(1);
    });
  }
});
