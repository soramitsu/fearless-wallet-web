import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { checkIfDenied } from '@polkadot/phishing';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import Tabs from '@extension-base/background/handlers/Tabs';
import type State from '@extension-base/background/handlers/State';
import type { AuthUrls, MessageTypes, Port, RequestAuthorizeTab } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services/request-service';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/services/solana-rpc-service', () => ({ createClusterBoundSolanaRpcClient: () => ({}) }));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    getAndWait(): Promise<AuthUrls> {
      return Promise.resolve({});
    }
    setAndWait(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

const phishing = 'https://phishing.example';
const port = { onDisconnect: { addListener: vi.fn() } } as unknown as Port;
// Public fixture account with Substrate, EVM, Solana and Iroha addresses.
const account = {
  'public-root': {
    type: 'sr25519',
    json: {
      address: 'public-root',
      meta: {
        name: 'Public fixture',
        ethereumAddress: `0x${'11'.repeat(20)}`,
        solanaAddress: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
        irohaPublicKeyHex: '12'.repeat(32),
      },
    },
  },
};
let auth: AuthRequestHandler;
let requestService: RequestService;
let tabs: Tabs;

beforeEach(async () => {
  vi.mocked(checkIfDenied).mockReset().mockImplementation(async (url: string) => url.startsWith(phishing));
  requestService = { popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService;
  const keyringService = {
    walletResetRevision: 0,
    encodeAddress: (address: string) => address,
    getAllSubstrateAccounts: () => [{ address: 'public-root' }],
    getAllAccounts: () => [{ address: 'public-root', meta: account['public-root'].json.meta }],
    accountSubject: new BehaviorSubject(account),
    addressSubject: new BehaviorSubject({}),
  };
  auth = new AuthRequestHandler(requestService, { networkService: {}, keyringService } as unknown as State);
  Object.assign(requestService, {
    authorizeUrl: (url: string, request: RequestAuthorizeTab) => auth.authorizeUrl(url, request),
    ensureUrlAuthorized: vi.fn(async () => true),
  });
  tabs = new Tabs({ keyringService, requestService, getAuthInfo: async () => undefined } as unknown as State);
  await auth.getAuthList();
});

describe('site connection prompts for phishing sites', () => {
  it.each(['substrate', 'evm', 'solana', 'iroha'] as const)(
    'refuses a listed site that asks for %s accounts before any prompt',
    async (accountAuthType) => {
      const request = auth.authorizeUrl(`${phishing}/connect`, { origin: 'Listed site', accountAuthType });

      await expect(request).rejects.toThrow('This site is blocked by the phishing protection');
      expect(checkIfDenied).toHaveBeenCalledWith(`${phishing}/connect`);
      expect(auth.numAuthRequests).toBe(0);
      expect(requestService.popupOpen).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['pub(authorize.tab)', { origin: 'Listed site' }],
    ['evm(authorizeUrl)', { method: 'eth_requestAccounts', params: { origin: 'Listed site' } }],
    ['solana(authorizeUrl)', { origin: 'Listed site' }],
    ['iroha(authorizeUrl)', { origin: 'Listed site' }],
  ] as const)('refuses %s sent directly by a listed site, without the page check', async (type, request) => {
    await expect(tabs.handle('page-request', type as MessageTypes, request as never, phishing, port)).rejects.toThrow(
      'This site is blocked by the phishing protection'
    );
    expect(auth.numAuthRequests).toBe(0);
    expect(requestService.popupOpen).not.toHaveBeenCalled();
  });

  it('still asks the user about a site that is not listed', async () => {
    void auth.authorizeUrl('https://public.example', { origin: 'Public site', accountAuthType: 'evm' });

    await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));
    expect(requestService.popupOpen).toHaveBeenCalledOnce();
  });
});
