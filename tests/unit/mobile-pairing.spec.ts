import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import Provider from '@walletconnect/universal-provider';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { Wallet } from 'ethers';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import { sessionStorage } from '../helpers/session-storage';
import type State from '@extension-base/background/handlers/State';
import type { Port } from '@extension-base/background/types/types';
import type { SessionTypes } from '@walletconnect/types';

vi.mock('@extension-base/utils/crossenv', async () => ({
  chrome: (await import('../helpers/session-storage')).sessionStorage.chrome,
}));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

// Public, unfunded development identities only. SDK transport is a controlled fixture.
const evm = new Wallet(`0x${'11'.repeat(32)}`).address;
const otherEvm = new Wallet(`0x${'22'.repeat(32)}`).address;
const genesis = '11'.repeat(32),
  caip = `polkadot:${genesis.slice(0, 32)}`;
let alice: string, bob: string;
let service: WalletConnectDAppService, session: SessionTypes.Struct;
let state: State, client: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
let approval: ReturnType<typeof vi.fn>, approve: (s: SessionTypes.Struct) => void;
let callbacks: Record<string, ReturnType<typeof vi.fn>>, unsubscribe: Record<string, () => void>;
let existing: { address: string; meta: Record<string, unknown> }[];
let sessions: SessionTypes.Struct[];
let records: { address: string; meta: Record<string, unknown> }[];
let port: Port, disconnectPort: () => void;
let init: (id: string, port?: Port) => Promise<string>;
let abort: (id: string, port?: Port) => Promise<boolean>;
let sessionListeners: Record<string, (event: { topic: string }) => void>;

beforeAll(async () => {
  await cryptoWaitReady();
  const keys = new Keyring({ type: 'sr25519' });
  alice = keys.addFromUri('//Alice').address;
  bob = keys.addFromUri('//Bob').address;
});
beforeEach(async () => {
  await new WalletConnectRetiredSessions().readTopics();
  sessionStorage.data = {};
  vi.restoreAllMocks();
  callbacks = {};
  unsubscribe = {};
  existing = [];
  records = [];
  sessionListeners = {};
  session = {
    topic: 'public-pairing-session',
    acknowledged: true,
    expiry: Math.floor(Date.now() / 1000) + 600,
    peer: {
      publicKey: 'public-peer',
      metadata: { name: 'Public mobile wallet', url: 'https://public.example', description: '', icons: [] },
    },
    namespaces: {
      polkadot: {
        methods: ['polkadot_signMessage', 'polkadot_signTransaction'],
        accounts: [`${caip}:${alice}`],
        events: [],
      },
      eip155: { methods: ['personal_sign', 'eth_sendTransaction'], accounts: [`eip155:10:${evm}`], events: [] },
    },
  } as unknown as SessionTypes.Struct;
  sessions = [];
  const promise = new Promise<SessionTypes.Struct>((resolve) => {
    approve = resolve;
  });
  approval = vi.fn(() => promise);
  client = {
    connect: vi.fn(async () => {
      sessions = [session];
      return { uri: 'wc:public-fixture', approval };
    }),
    disconnect: vi.fn(async () => undefined),
  };
  const app = {
    client: {
      ...client,
      session: {
        get values() {
          return sessions;
        },
      },
      on: vi.fn((event, callback) => { sessionListeners[event] = callback; }),
    },
    abortPairingAttempt: vi.fn(),
  };
  vi.spyOn(Provider, 'init').mockResolvedValue(app as unknown as Provider);
  const networks = [
    { name: 'Optimism', ecosystem: 'ethereum', chainId: '10' },
    { name: 'Arbitrum', ecosystem: 'ethereum', chainId: '42161' },
    { name: 'Public substrate', ecosystem: 'substrate', chainId: genesis, genesisHash: `0x${genesis}` },
  ];
  state = {
    networkService: { networksGithub: networks, networkValues: networks },
    keyringService: {
      currentAccountRevision: 0,
      encodeAddress,
      getAllAccounts: () => [...existing, ...records],
      getAddresses: () => records,
      getAddress: (address: string) => records.find((r) => r.address === address),
      saveAddress: vi.fn(async (address, meta, _type, options) => {
        options?.assertCurrent?.();
        records.push({ address, meta });
      }),
    },
    updateCurrentAccount: vi.fn(),
    subscriptionService: {
      createSubscription: vi.fn((id) => (callbacks[id] = vi.fn())),
      setUnsubscriptionHandle: vi.fn((id, cb) => {
        unsubscribe[id] = cb;
      }),
      cancelSubscription: vi.fn((id) => unsubscribe[id]?.()),
    },
  } as unknown as State;
  port = {
    onDisconnect: {
      addListener: vi.fn((cb) => {
        disconnectPort = cb;
      }),
      removeListener: vi.fn(),
    },
  } as unknown as Port;
  service = new WalletConnectDAppService(state);
  init = service.initPairing.bind(service) as typeof init;
  abort = service.abortPairingAttempt.bind(service) as typeof abort;
});
async function begin() {
  const uri = await init('public-attempt', port);
  await service.subscribePairing(uri, 'first', port);
  return uri;
}
async function settle(data = session) {
  approve(data);
  // Allow SDK approval and completion/finally continuations, without wall-clock sleeps.
  for (let i = 0; i < 24; i++) await Promise.resolve();
  await new WalletConnectRetiredSessions().readTopics();
}
function noImport() {
  expect(state.keyringService.saveAddress).not.toHaveBeenCalled();
  expect(state.updateCurrentAccount).not.toHaveBeenCalled();
}

describe('mobile pairing negotiation and approved identities', () => {
  it('retains complete decimal EVM chain IDs and advertises only implemented methods', async () => {
    await init('public-attempt', port);
    const proposal = client.connect.mock.calls[0][0];
    expect(proposal.optionalNamespaces.eip155.chains).toEqual(['eip155:10', 'eip155:42161']);
    expect(proposal.optionalNamespaces.eip155.methods).not.toEqual(expect.arrayContaining(['eth_signTypedData_v1']));
    expect(proposal.optionalNamespaces.eip155.methods).not.toContain('eth_sendRawTransaction');
    expect(proposal.optionalNamespaces.eip155.methods).not.toContain('eth_signTransaction');
    expect(proposal.requiredNamespaces).toEqual({});
  });
  it('uses canonical genesis prefixes and excludes disabled or unrelated networks', async () => {
    Object.assign(state.networkService, {
      networkValues: [
        { name: 'Public', ecosystem: 'substrate', chainId: `0x${genesis}`, genesisHash: `0x${genesis}` },
        { name: 'Disabled', ecosystem: 'ethereum', chainId: '1', disabled: true },
        { name: 'Solana', ecosystem: 'solana', chainId: 'abc' },
      ],
    });
    await init('public-attempt', port);
    const proposal = client.connect.mock.calls[0][0];
    expect(proposal.optionalNamespaces.polkadot.chains).toEqual([caip]);
    expect(proposal.optionalNamespaces.eip155).toBeUndefined();
  });
  it('imports the unique root and the actual eip155 account, deriving chains from CAIP accounts', async () => {
    await begin();
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      address: encodeAddress(alice),
      meta: {
        isMobile: true,
        wcTopic: session.topic,
        ethereumAddress: evm.toLowerCase(),
        chains: [genesis.slice(0, 32), '10'],
      },
    });
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: true });
  });
  it('accepts chain-scoped grants and aliases of one decoded root', async () => {
    const grant = session.namespaces.polkadot;
    grant.accounts.push(`${caip}:${encodeAddress(alice, 0)}`);
    session.namespaces = { [caip]: grant, 'eip155:10': session.namespaces.eip155 };
    await begin();
    await settle();
    expect(records).toHaveLength(1);
  });
  it('supports an approved Substrate-only wallet without fabricating an EVM identity', async () => {
    delete session.namespaces.eip155;
    await begin();
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0].meta.ethereumAddress).toBeUndefined();
  });
  it.each([
    'multiple roots',
    'multiple EVM identities',
    'EVM only',
    'unacknowledged',
    'expired',
    'missing peer',
    'wrong scoped grant',
    'chain excluded',
    'no supported methods',
  ])('rejects %s before persistence', async (kind) => {
    if (kind === 'multiple roots') session.namespaces.polkadot.accounts.push(`${caip}:${bob}`);
    if (kind === 'multiple EVM identities') session.namespaces.eip155.accounts.push(`eip155:10:${otherEvm}`);
    if (kind === 'EVM only') delete session.namespaces.polkadot;
    if (kind === 'unacknowledged') session.acknowledged = false;
    if (kind === 'expired') session.expiry = Math.floor(Date.now() / 1000) - 1;
    if (kind === 'missing peer') session.peer.publicKey = '';
    if (kind === 'wrong scoped grant') {
      session.namespaces['polkadot:' + '22'.repeat(16)] = session.namespaces.polkadot;
      delete session.namespaces.polkadot;
    }
    if (kind === 'chain excluded') session.namespaces.polkadot.chains = ['polkadot:' + '22'.repeat(16)];
    if (kind === 'no supported methods') session.namespaces.polkadot.methods = [];
    await begin();
    await settle();
    noImport();
  });
  it('rejects an SS58 alias duplicate of an existing account', async () => {
    existing.push({ address: encodeAddress(alice, 0), meta: {} });
    await begin();
    await settle();
    noImport();
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: false, message: 'duplicate' });
  });
  it('rejects an EVM mapping already owned by another stored root', async () => {
    existing.push({ address: bob, meta: { ethereumAddress: evm } });
    await begin();
    await settle();
    noImport();
  });
  it.each(['missing', 'changed peer', 'changed grants', 'retired'])(
    'rejects %s live session at approval',
    async (kind) => {
      await begin();
      const approvalSnapshot = structuredClone(session);
      if (kind === 'missing') sessions = [];
      if (kind === 'changed peer') session.peer.publicKey = 'replaced-peer';
      if (kind === 'changed grants') session.namespaces.polkadot.accounts = [`${caip}:${bob}`];
      if (kind === 'retired') service.disconnect(session.topic);
      await settle(approvalSnapshot);
      noImport();
    }
  );
});

describe('pairing attempt ownership', () => {
  it('consumes approval once and rejects a second subscriber without replacing the owner', async () => {
    const uri = await begin();
    await service.subscribePairing(uri, 'second', port);
    await settle();
    expect(approval).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: true });
    expect(callbacks.second).toHaveBeenCalledWith(expect.objectContaining({ status: false }));
  });
  it.each(['cancel', 'unsubscribe', 'port disconnect'])(
    'ignores approval after %s and retires its late session',
    async (kind) => {
      await begin();
      if (kind === 'cancel') abort('public-attempt', port);
      if (kind === 'unsubscribe') unsubscribe.first();
      if (kind === 'port disconnect') disconnectPort();
      await settle();
      noImport();
      expect(client.disconnect).toHaveBeenCalledWith(expect.objectContaining({ topic: session.topic }));
      expect(callbacks.first).not.toHaveBeenCalledWith({ status: true });
    }
  );
});

describe('pairing boundary failures and isolation', () => {
  it('cancels before provider initialization finishes without proposing a session', async () => {
    let release!: (value: Provider) => void;
    vi.mocked(Provider.init).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const delayed = new WalletConnectDAppService(state);
    const pending = delayed.initPairing('before-init', port);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    void delayed.abortPairingAttempt('before-init', port);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release({ client: { on: vi.fn() } } as unknown as Provider);
    await rejected;
    expect(client.connect).not.toHaveBeenCalled();
    noImport();
  });
  it('observes a late approval when cancelled during connect', async () => {
    let release!: (value: { uri: string; approval: typeof approval }) => void;
    client.connect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const pending = init('during-connect', port);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    abort('during-connect', port);
    release({ uri: 'wc:late-fixture', approval });
    await rejected;
    await settle();
    noImport();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
  it('does not let another port subscribe or cancel this attempt', async () => {
    const uri = await init('public-attempt', port);
    const otherPort = {} as Port;
    await service.subscribePairing(uri, 'foreign', otherPort);
    abort('public-attempt', otherPort);
    await service.subscribePairing(uri, 'first', port);
    await settle();
    expect(callbacks.foreign).toHaveBeenCalledWith({ status: false, message: 'unavailable' });
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: true });
    expect(records).toHaveLength(1);
  });
  it('does not reconnect a reused attempt ID', async () => {
    await init('public-attempt', port);
    abort('public-attempt', port);
    await expect(init('public-attempt', port)).rejects.toThrow('reused');
    expect(client.connect).toHaveBeenCalledOnce();
  });
  it('does not import or disconnect a previously established session', async () => {
    sessions = [session];
    await begin();
    await settle();
    noImport();
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it('waits for an owned subscriber before importing an already resolved approval', async () => {
    const uri = await init('public-attempt', port);
    await settle();
    noImport();
    await service.subscribePairing(uri, 'first', port);
    expect(records).toHaveLength(1);
  });
  it('does not select an account after the user changes wallets while pairing', async () => {
    await begin();
    Object.assign(state, { currentAccount: { address: bob } });
    await settle();
    noImport();
  });
  it('derives available networks from approved matching accounts and vetoes revocation', async () => {
    await begin();
    await settle();
    expect(service.availableNetworks(records[0].address)).toEqual([genesis.slice(0, 32), '10']);
    session.namespaces.eip155.accounts = [`eip155:10:${otherEvm}`];
    expect(service.availableNetworks(records[0].address)).toEqual([]);
  });
  it('does not infer an EVM identity from a 20-byte Polkadot grant', async () => {
    delete session.namespaces.eip155;
    session.namespaces.polkadot.accounts.push(`${caip}:${evm}`);
    await begin();
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0].meta.ethereumAddress).toBeUndefined();
  });
  it('does not persist a forged approval with a different topic', async () => {
    await begin();
    await settle({ ...session, topic: 'unknown-session' });
    noImport();
  });
});

function delayedAddressWrite() {
  let submit!: () => void, acknowledge!: () => void, reject!: (reason: Error) => void;
  vi.mocked(state.keyringService.saveAddress).mockImplementationOnce((address, meta, _type, options) =>
    new Promise<void>((resolve, fail) => {
      reject = fail;
      submit = () => {
        try { options?.assertCurrent?.(); } catch (error) { fail(error); return; }
        acknowledge = () => { records.push({ address, meta }); resolve(); };
      };
    })
  );
  return {
    submit: () => submit(),
    acknowledge: () => acknowledge(),
    reject: () => reject(new Error('Public storage failure')),
  };
}

async function continueCompletion() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
  await new WalletConnectRetiredSessions().readTopics();
}

describe('pairing storage acknowledgement and late invalidation', () => {
  it('waits for durable storage before selecting or announcing success', async () => {
    const write = delayedAddressWrite();
    await begin();
    await settle();
    write.submit();
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(callbacks.first).not.toHaveBeenCalled();
    write.acknowledge();
    await continueCompletion();
    expect(state.updateCurrentAccount).toHaveBeenCalledOnce();
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: true });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('reports storage failure without selecting and retires its new session', async () => {
    const write = delayedAddressWrite();
    await begin();
    await settle();
    write.submit();
    write.reject();
    await continueCompletion();
    expect(records).toEqual([]);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: false, message: 'unavailable' });
    expect(() => service.getSession(session.topic)).toThrow();
  });

  it('rechecks cancellation before a queued write starts', async () => {
    const write = delayedAddressWrite();
    await begin();
    await settle();
    abort('public-attempt', port);
    write.submit();
    await continueCompletion();
    expect(records).toEqual([]);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(callbacks.first).not.toHaveBeenCalledWith({ status: true });
  });

  it('rechecks duplicate ownership before a queued write starts', async () => {
    const write = delayedAddressWrite();
    await begin();
    await settle();
    existing.push({ address: bob, meta: { ethereumAddress: evm } });
    write.submit();
    await continueCompletion();
    expect(records).toEqual([]);
    expect(callbacks.first).toHaveBeenLastCalledWith({ status: false, message: 'duplicate' });
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'port disconnect', 'selection changed', 'selection revision', 'session changed', 'session revision', 'expired'])(
    'retains an acknowledged public record but refuses late success after %s', async (kind) => {
      const write = delayedAddressWrite();
      await begin();
      await settle();
      write.submit();
      if (kind === 'cancel') abort('public-attempt', port);
      if (kind === 'port disconnect') disconnectPort();
      if (kind === 'selection changed') Object.assign(state, { currentAccount: { address: bob } });
      if (kind === 'selection revision') Object.assign(state.keyringService, { currentAccountRevision: 2 });
      if (kind === 'session changed') session.peer.publicKey = 'changed-public-peer';
      if (kind === 'session revision') sessionListeners.session_update({ topic: session.topic });
      if (kind === 'expired') session.expiry = Math.floor(Date.now() / 1000) - 1;
      write.acknowledge();
      await continueCompletion();
      expect(records).toHaveLength(1);
      expect(state.updateCurrentAccount).not.toHaveBeenCalled();
      expect(callbacks.first).not.toHaveBeenCalledWith({ status: true });
      expect(() => service.getSession(session.topic)).toThrow();
      expect(service.availableNetworks(records[0].address)).toEqual([]);
      expect(client.disconnect).toHaveBeenCalledWith(expect.objectContaining({ topic: session.topic }));
    }
  );
});
