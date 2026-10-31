import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import Tabs from '@extension-base/background/handlers/Tabs';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
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

const url = 'https://public.example';
const solanaAddress = vectors.vectors[0].expected.solana.address;
const message = { messageBase64: 'AQID', origin: 'Public app' };
// Public fixture: one wallet with a Substrate root and a Solana address, shared with the site.
const grant = {
  id: 'public-grant',
  count: 0,
  isAllowed: true,
  origin: url,
  url,
  accountAuthType: 'all',
  authorizedAccounts: ['public-root'],
  evmAuthorizedAccount: '',
  solanaAuthorizedAccount: solanaAddress,
  allowedAccountsMap: {},
} as unknown as AuthUrls[string];

class PagePort {
  private readonly listeners: Array<() => void> = [];
  readonly onDisconnect = { addListener: (listener: () => void) => this.listeners.push(listener) };

  disconnect() {
    this.listeners.forEach((listener) => listener());
  }
}
const outcome = <T>(result: Promise<T>) =>
  result.then(
    (value) => ({ value }),
    (error: Error) => ({ error: error.message })
  );
let requestService: RequestService;
let state: State;
let auth: AuthRequestHandler;
let solana: SolanaRequestHandler;
let tabs: Tabs;
const send = (port: PagePort, type: MessageTypes, request: unknown, from = url) =>
  outcome(tabs.handle('page-request', type, request as never, from, port as unknown as Port));

beforeEach(async () => {
  requestService = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureUrlAuthorized: vi.fn(async () => true),
  } as unknown as RequestService;
  const keyringService = {
    walletResetRevision: 0,
    encodeAddress: (address: string) => address,
    getAllSubstrateAccounts: () => [{ address: 'public-root' }],
    getAllAccounts: () => [{ address: 'public-root', meta: { solanaAddress } }],
    accountSubject: new BehaviorSubject({
      'public-root': {
        type: 'sr25519',
        json: { address: 'public-root', meta: { name: 'Public fixture', solanaAddress } },
      },
    }),
    addressSubject: new BehaviorSubject({}),
  };
  state = { keyringService, requestService } as unknown as State;
  auth = new AuthRequestHandler(requestService, state);
  solana = new SolanaRequestHandler(requestService);
  Object.assign(requestService, {
    authRequestHandler: auth,
    solanaRequestHandler: solana,
    authorizeUrl: (site: string, request: RequestAuthorizeTab, signal?: AbortSignal) =>
      auth.authorizeUrl(site, request, signal),
  });
  Object.assign(state, { getAuthInfo: vi.fn(async () => (await auth.getAuthList())[url]) });
  tabs = new Tabs(state);
  await auth.setAuthorize({ [url]: grant });
});

describe('requests of a page whose port closes', () => {
  it('are cancelled, while another tab of the same site keeps its own', async () => {
    const [closing, open] = [new PagePort(), new PagePort()];
    const closed = send(closing, 'solana(signMessage)', message);
    const kept = send(open, 'solana(signMessage)', message);
    await vi.waitFor(() => expect(Object.keys(solana.signSolanaSubject.value)).toHaveLength(2));
    const [closedKey, keptKey] = Object.keys(solana.signSolanaSubject.value);

    closing.disconnect();

    expect(await closed).toEqual({ error: 'Cancelled' });
    expect(Object.keys(solana.signSolanaSubject.value)).toEqual([keptKey]);
    expect(solana.getSolanaSignRequest(closedKey)).toBeUndefined();
    solana.getSolanaSignRequest(keptKey)!.reject(new Error('Fixture cleanup'));
    expect(await kept).toEqual({ error: 'Fixture cleanup' });
  });

  it('closes a connection prompt the page opened', async () => {
    const port = new PagePort();
    const other = 'https://other.public.example';
    const prompt = send(port, 'pub(authorize.tab)', { origin: 'Other app' }, other);
    await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));

    port.disconnect();

    expect(await prompt).toEqual({ error: 'Cancelled' });
    expect(auth.numAuthRequests).toBe(0);
    expect(auth.authSubject.value).toEqual([]);
  });

  it('never queues a request that was still being admitted when the port closed', async () => {
    const port = new PagePort();
    let release!: () => void;
    const lookup = vi.mocked(state.getAuthInfo);
    lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(grant);
        })
    );
    const request = send(port, 'solana(signMessage)', message);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    port.disconnect();
    release();

    expect(await request).toEqual({ error: 'Cancelled' });
    expect(solana.signSolanaSubject.value).toEqual({});
    expect(requestService.popupOpen).not.toHaveBeenCalled();
  });
});
