import { WalletConnectClient as WalletConnect } from '@extension-base/services/wallet-connect-service/protocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type { RequestService } from '@extension-base/services/request-service';
import type State from '@extension-base/background/handlers/State';
import type { WcSession } from '@extension-base/services/wallet-connect-service/protocol/types';

const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { getURL: (path: string) => path, lastError: undefined },
  storage: { local: {
    get: (keys: string | string[] | null, callback?: (value: Record<string, unknown>) => void) => {
      const wanted = keys === null ? Object.keys(fixture.data) : [keys].flat();
      const value = structuredClone(Object.fromEntries(wanted.filter((key) => key in fixture.data)
        .map((key) => [key, fixture.data[key]])));
      if (!callback) return Promise.resolve(value);
      callback(value);
    },
    set: (data: Record<string, unknown>, callback?: () => void) => {
      Object.assign(fixture.data, structuredClone(data));
      callback?.();
      return Promise.resolve();
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

// Public fixtures. Fearless has one key in every session: it controls the sessions dApps open with it as their wallet,
// and the mobile wallet controls the pairings Fearless proposes to it.
const metadata = { name: 'Public peer', description: '', url: 'https://public.example', icons: [] };
const self = { publicKey: 'public-fearless-key', metadata };
const shared = `0x${'11'.repeat(20)}`;
const dappSession = {
  topic: 'public-dapp-session', controller: self.publicKey, self, peer: { publicKey: 'public-dapp-key', metadata },
  namespaces: { eip155: { accounts: [`eip155:1:0x${'22'.repeat(20)}`], methods: ['personal_sign'], events: [] } },
} as unknown as WcSession;
const mobileSession = {
  topic: 'public-mobile-session', controller: 'public-phone-key', self, peer: { publicKey: 'public-phone-key', metadata },
  namespaces: { eip155: { accounts: [`eip155:1:${shared}`], methods: ['personal_sign'], events: [] } },
} as unknown as WcSession;
// A record without a controller is never served to dApps.
const unknownSession = { topic: 'public-unknown-session', self, peer: { publicKey: 'public-dapp-key', metadata }, namespaces: {} } as unknown as WcSession;
const SESSIONS = 'wc@2:client:0.3//session';
const topics = (sessions: WcSession[]) => sessions.map(({ topic }) => topic);

// What WalletConnect.init returns: a new client that restored its own copy of the stored session records.
type Client = ReturnType<typeof sdkClient>;
let clients: Client[];
function sdkClient() {
  const values = structuredClone((fixture.data[SESSIONS] ?? []) as WcSession[]);
  const client = {
    connect: vi.fn(async () => ({ uri: 'wc:public-pairing', approval: () => new Promise(() => undefined) })),
    disconnect: vi.fn<(args: { topic: string }) => Promise<void>>(async () => undefined),
    on: vi.fn(),
    session: { values, getAll: () => values, get: (key: string) => values.find(({ topic }) => topic === key) },
    core: { storage: { getItem: async () => undefined } },
  };
  return client;
}
const listeners = (client: Client, event: string) => client.on.mock.calls.filter(([name]) => name === event).length;

const makeState = () => ({
  networkService: { networkValues: [{ name: 'Public Substrate', ecosystem: 'substrate', chainId: '11'.repeat(32) }] },
  keyringService: { isResetting: false, walletResetRevision: 0, getAddresses: () => [], getAllAccounts: () => [] },
} as unknown as State);
function services() {
  const state = makeState();
  const wallet = new WalletConnectService(state, {} as RequestService);
  const mobile = new WalletConnectDAppService(state);
  Object.assign(state, { walletConnectService: wallet, walletConnectDappService: mobile });
  return { wallet, mobile };
}
async function restored() {
  fixture.data[SESSIONS] = [dappSession, mobileSession, unknownSession];
  const started = services();
  await vi.waitFor(() => expect(started.wallet.sessions.length && started.mobile.sessions.length).toBeTruthy());
  return started;
}

beforeEach(() => {
  fixture.data = {};
  clients = [];
  vi.restoreAllMocks();
  vi.spyOn(WalletConnect, 'init').mockImplementation(async () => {
    const client = sdkClient();
    clients.push(client);
    return client as unknown as WalletConnect;
  });
});
afterEach(async () => {
  await BaseExtensionStore.flush().catch(() => undefined);
});

// The SDK gives every client in a worker one Core: a second client adds a second engine on the same relay that
// answers requests on sessions it does not know with errors, and a second copy of the session records under the same
// storage keys.
describe('one WalletConnect client for both roles in a worker', () => {
  it('starts one client when a worker restores stored sessions', async () => {
    await restored();

    expect(WalletConnect.init).toHaveBeenCalledOnce();
  });

  it.each(['wallet', 'mobile pairing'])('shares the client the %s started', async (first) => {
    const { wallet, mobile } = services();
    const pairDapp = () => wallet.initClient(true);
    const pairMobile = () => mobile.initPairing('public-attempt');

    await (first === 'wallet' ? pairDapp() : pairMobile());
    await (first === 'wallet' ? pairMobile() : pairDapp());

    expect(WalletConnect.init).toHaveBeenCalledOnce();
    // Both roles listen on that client, each for its own events.
    expect(listeners(clients[0], 'session_proposal')).toBe(1);
    expect(listeners(clients[0], 'session_delete')).toBe(2);
    expect(clients[0].connect).toHaveBeenCalledOnce();
  });

  it('starts the client again after a failed start', async () => {
    vi.mocked(WalletConnect.init).mockRejectedValueOnce(new Error('Public relay unavailable'));
    const { wallet, mobile } = services();

    await expect(wallet.initClient(true)).rejects.toThrow('Public relay unavailable');
    await expect(mobile.initPairing('public-attempt')).resolves.toBe('wc:public-pairing');
    await wallet.initClient(true);

    expect(WalletConnect.init).toHaveBeenCalledTimes(2);
    expect(listeners(clients[0], 'session_proposal')).toBe(1);
  });
});

describe('each role keeps to its own sessions', () => {
  it('lists and serves a dApp session only as the wallet, and a mobile pairing only on the dApp side', async () => {
    const { wallet, mobile } = await restored();

    expect(topics(wallet.sessions)).toEqual([dappSession.topic]);
    expect(wallet.getSession(dappSession.topic).topic).toBe(dappSession.topic);
    expect(() => wallet.getSession(mobileSession.topic)).toThrow();
    expect(() => wallet.getSession(unknownSession.topic)).toThrow();
    expect(topics(wallet.sessionSubject.value)).toEqual([dappSession.topic]);

    expect(topics(mobile.sessions)).toEqual([mobileSession.topic, unknownSession.topic]);
    expect(mobile.getSession(mobileSession.topic).topic).toBe(mobileSession.topic);
    expect(() => mobile.getSession(dappSession.topic)).toThrow();
  });

  it('resets and disconnects only its own sessions, and between them every stored one', async () => {
    const { wallet, mobile } = await restored();
    const disconnected = () => clients.flatMap((client) => client.disconnect.mock.calls.map(([{ topic }]) => topic));

    // Reset wallet resets the mobile pairings first.
    await mobile.resetWallet();
    expect(disconnected()).toEqual([mobileSession.topic, unknownSession.topic]);
    clients.forEach((client) => client.disconnect.mockClear());
    await wallet.resetWallet();
    expect(disconnected()).toEqual([dappSession.topic]);
    expect(fixture.data['fwWalletConnect:retiredTopics']).toMatchObject({
      topics: expect.arrayContaining([dappSession.topic, mobileSession.topic, unknownSession.topic]),
    });
  });

  it('removing a wallet account leaves the mobile pairings that name the same address alone', async () => {
    const { wallet, mobile } = await restored();

    await wallet.removeSessions(`0x${'33'.repeat(32)}`, shared);

    expect(clients.flatMap((client) => client.disconnect.mock.calls)).toEqual([]);
    expect(topics(mobile.sessions)).toContain(mobileSession.topic);
  });
});
