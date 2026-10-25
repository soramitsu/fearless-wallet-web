import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, Transaction, getBytes, verifyMessage } from 'ethers';
import { checkIfDenied } from '@polkadot/phishing';
import { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { Eip155RequestHandler } from '@extension-base/services/wallet-connect-service/requestHandlers/Eip155Handler';
import Extension from '@extension-base/background/handlers/Extension';
import { sessionStorage } from '../helpers/session-storage';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', async () => ({
  chrome: (await import('../helpers/session-storage')).sessionStorage.chrome,
}));

// Public, unfunded fixture key. No RPC or relay is contacted.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const address = wallet.address;
let state: State, queue: EvmRequestHandler, extension: Extension, incoming: Eip155RequestHandler;
let session: SessionTypes.Struct;
let revision: number;
let network: {
  name: string;
  chainId: string;
  genesisHash: string;
  ecosystem: string;
  disabled: boolean;
  active: boolean;
  currentProvider: string;
  assets: unknown[];
};
const event = (method = 'personal_sign', params: unknown[] = ['0x1234', address]) =>
  ({
    id: 7,
    topic: 'public-topic',
    params: { chainId: 'eip155:1', request: { method, params } },
    verifyContext: { verified: { origin: 'https://public.example', validation: 'VALID', verifyUrl: '' } },
  }) as SignClientTypes.EventArguments['session_request'];
beforeEach(async () => {
  await new WalletConnectRetiredSessions().readTopics();
  sessionStorage.data = {};
  vi.mocked(checkIfDenied).mockResolvedValue(false);
  revision = 0;
  session = {
    topic: 'public-topic',
    acknowledged: true,
    expiry: Math.floor(Date.now() / 1000) + 600,
    peer: {
      publicKey: 'public-peer',
      metadata: { name: 'Public fixture', url: 'https://public.example', description: '', icons: [] },
    },
    namespaces: {
      eip155: {
        accounts: [`eip155:1:${address}`],
        chains: ['eip155:1'],
        methods: ['personal_sign', 'eth_sendTransaction'],
        events: [],
      },
    },
    requiredNamespaces: {
      eip155: { chains: ['eip155:1', 'eip155:2'], methods: ['personal_sign', 'eth_sendTransaction'], events: [] },
    },
    optionalNamespaces: {},
  } as unknown as SessionTypes.Struct;
  network = {
    name: 'Ethereum',
    chainId: '1',
    genesisHash: '0x1234',
    ecosystem: 'ethereum',
    disabled: false,
    active: true,
    currentProvider: 'https://rpc.public.invalid',
    assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
  };
  queue = new EvmRequestHandler({ updateIcon: vi.fn(), popupOpen: vi.fn() } as unknown as RequestService);
  const wc = {
    getSession: vi.fn(() => session),
    getSessionRevision: vi.fn(() => revision),
    isRequestExpired: () => false,
    responseRequest: vi.fn(async () => undefined),
  };
  state = {
    walletConnectService: wc,
    requestService: { evmRequestHandler: queue },
    networkService: { networkMap: { Ethereum: network }, findNetworkJsonByChainId: vi.fn(() => network) },
    getEvmApi: vi.fn(() => undefined),
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getSubstrateAddress: vi.fn(() => 'root'),
      getEthereumAddress: vi.fn(() => address),
      getAllAccounts: vi.fn(() => [{ address: 'root', meta: { name: 'Public account', ethereumAddress: address, walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } }]),
      getAddresses: vi.fn(() => []),
      isMobileAccount: vi.fn(() => false),
      accountExportPrivateKey: vi.fn(() => ({ privateKey: wallet.privateKey })),
      unlockPair: vi.fn(),
    },
  } as unknown as State;
  extension = new Extension(state);
  incoming = new Eip155RequestHandler(state, state.walletConnectService);
});
afterEach(async () => {
  for (const r of queue.signWcSubject.value)
    queue.getSignWCRequest(r.approvalId)?.reject(new Error('Public fixture cleanup'));
  await Promise.resolve();
  vi.restoreAllMocks();
});
const admit = async (value = event()) => {
  await incoming.handleRequest(value);
  return queue.signWcSubject.value[0]?.approvalId;
};
const providerFixture = () => ({
  getNetwork: vi.fn(async () => ({ chainId: 1n })),
  getTransactionCount: vi.fn(async () => 0),
  estimateGas: vi.fn(async () => 21000n),
  getFeeData: vi.fn(async () => ({ gasPrice: 1n, maxFeePerGas: null, maxPriorityFeePerGas: null })),
  broadcastTransaction: vi.fn(async (_signed: string) => ({ hash: '0xpublic' })),
});

describe('WalletConnect uses the approved session grant at admission', () => {
  it('rejects a request whose explicit deadline has expired', () => {
    const request = event();
    request.params.request.expiryTimestamp = 1;
    expect(() => incoming.handleRequest(request)).toThrow();
    expect(queue.numWcSignRequest).toBe(0);
  });

  it.each([
    [
      'method was only requested',
      () => {
        session.namespaces.eip155.methods = [];
      },
    ],
    [
      'account is authorized only on another chain',
      () => {
        session.namespaces.eip155.accounts = [`eip155:2:${address}`];
      },
    ],
    [
      'chain was only requested',
      () => {
        session.namespaces.eip155.chains = ['eip155:2'];
        session.namespaces.eip155.accounts = [`eip155:2:${address}`];
      },
    ],
    [
      'expired session',
      () => {
        session.expiry = Math.floor(Date.now() / 1000) - 1;
      },
    ],
    [
      'unacknowledged session',
      () => {
        session.acknowledged = false;
      },
    ],
    [
      'disabled network',
      () => {
        network.disabled = true;
      },
    ],
    [
      'non-EVM network with same chain number',
      () => {
        network.ecosystem = 'substrate';
      },
    ],
  ] as const)('rejects %s before queueing', async (_name, change) => {
    change();
    await expect(admit()).rejects.toThrow();
    expect(queue.numWcSignRequest).toBe(0);
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('rejects a transaction claiming a different chain', async () => {
    await expect(
      admit(
        event('eth_sendTransaction', [
          { from: address, to: '0x2222222222222222222222222222222222222222', chainId: '0x2', value: '0x1' },
        ])
      )
    ).rejects.toThrow();
    expect(queue.numWcSignRequest).toBe(0);
  });
});

describe('WalletConnect approval revalidates the captured session and network', () => {
  it.each([
    [
      'method permission revoked',
      () => {
        session.namespaces.eip155.methods = [];
      },
    ],
    [
      'account permission moved to another chain',
      () => {
        session.namespaces.eip155.accounts = [`eip155:2:${address}`];
      },
    ],
    [
      'session expired',
      () => {
        session.expiry = Math.floor(Date.now() / 1000) - 1;
      },
    ],
    [
      'peer identity changed',
      () => {
        session.peer.publicKey = 'different-peer';
      },
    ],
    [
      'requester origin changed',
      () => {
        session.peer.metadata.url = 'https://different.example';
      },
    ],
    [
      'session updated away and back',
      () => {
        revision += 2;
      },
    ],
    [
      'network disabled',
      () => {
        network.disabled = true;
      },
    ],
    [
      'provider configuration changed',
      () => {
        network.currentProvider = 'https://other.public.invalid';
      },
    ],
  ] as const)('blocks %s before exporting a key', async (_name, change) => {
    const approvalId = await admit();
    change();
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('blocks a deleted session before exporting a key', async () => {
    const approvalId = await admit();
    vi.mocked(state.walletConnectService.getSession).mockImplementation(() => {
      throw new Error('deleted');
    });
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('blocks a transaction provider on the wrong chain before exporting a key', async () => {
    const approvalId = await admit(
      event('eth_sendTransaction', [{ from: address, to: '0x2222222222222222222222222222222222222222', value: '0x1' }])
    );
    vi.mocked(state.getEvmApi).mockReturnValue({ api: { getNetwork: vi.fn(async () => ({ chainId: 2n })) } } as never);
    vi.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({ hash: '0xpublic' } as never);
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
});

describe('WalletConnect captures and revalidates asynchronous boundaries', () => {
  it.each(['revoked grant', 'session revision', 'expired session', 'provider replacement'])(
    'rejects %s during unsigned transaction population before key export',
    async (change) => {
      const approvalId = await admit(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
      const provider = providerFixture();
      vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
      let done!: (fees: Awaited<ReturnType<typeof provider.getFeeData>>) => void;
      provider.getFeeData.mockReturnValueOnce(
        new Promise((resolve) => {
          done = resolve;
        })
      );
      const approving = extension.wcRequestApprove({ address, approvalId });
      await vi.waitFor(() => expect(provider.getFeeData).toHaveBeenCalledOnce());
      if (change === 'revoked grant') session.namespaces.eip155.methods = [];
      if (change === 'session revision') revision += 1;
      if (change === 'expired session') session.expiry = Math.floor(Date.now() / 1000) - 1;
      if (change === 'provider replacement')
        vi.mocked(state.getEvmApi).mockReturnValue({ api: providerFixture() } as never);
      done({ gasPrice: 1n, maxFeePerGas: null, maxPriorityFeePerGas: null });
      await expect(approving).rejects.toThrow();
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
      expect(provider.broadcastTransaction).not.toHaveBeenCalled();
    }
  );
  it('does not broadcast if the session changes while a transaction signature is pending', async () => {
    const approvalId = await admit(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
    const provider = providerFixture();
    vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
    let done!: (signed: string) => void;
    const sign = vi.spyOn(Wallet.prototype, 'signTransaction').mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const approving = extension.wcRequestApprove({ address, approvalId });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    revision += 1;
    done('0xpublic');
    await expect(approving).rejects.toThrow();
    expect(provider.broadcastTransaction).not.toHaveBeenCalled();
  });
  it('does not release a message signature if the session changes while signing is pending', async () => {
    const approvalId = await admit();
    let done!: (signature: string) => void;
    const sign = vi.spyOn(Wallet.prototype, 'signMessage').mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const approving = extension.wcRequestApprove({ address, approvalId });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    revision += 1;
    done('0xpublic');
    await expect(approving).rejects.toThrow();
    expect(state.walletConnectService.responseRequest).not.toHaveBeenCalled();
  });
  it('honors SDK request expiry before private-key export', async () => {
    const approvalId = await admit();
    vi.spyOn(state.walletConnectService, 'isRequestExpired').mockReturnValue(true);
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow(/expired/);
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('does not release the result if a session changes in the queue completion microtask', async () => {
    const approvalId = await admit();
    const queued = queue.getSignWCRequest(approvalId)!;
    const resolve = queued.resolve;
    queued.resolve = (value) => {
      resolve(value);
      revision += 1;
    };
    await expect(extension.wcRequestApprove({ address, approvalId })).resolves.toBe(true);
    await vi.waitFor(() => expect(state.walletConnectService.responseRequest).toHaveBeenCalledOnce());
    const response = vi.mocked(state.walletConnectService.responseRequest).mock.calls[0][0];
    expect((response.response as { error?: unknown }).error).toBeDefined();
  });
  it('accepts a chain-keyed approved namespace and preserves exact message bytes', async () => {
    session.namespaces = { 'eip155:1': { ...session.namespaces.eip155, chains: undefined } };
    const approvalId = await admit();
    session.expiry += 600; // Extending the same grant does not change the reviewed intent.
    await expect(extension.wcRequestApprove({ address, approvalId })).resolves.toBe(true);
    await vi.waitFor(() => expect(state.walletConnectService.responseRequest).toHaveBeenCalledOnce());
    const response = vi.mocked(state.walletConnectService.responseRequest).mock.calls[0][0];
    expect(response.topic).toBe('public-topic');
    expect(response.response.id).toBe(7);
    expect(verifyMessage(getBytes('0x1234'), (response.response as { result: string }).result)).toBe(address);
  });
  it.each(['INVALID', 'scam', 'wrong verified origin'])('rejects %s before queueing', async (reason) => {
    const value = event();
    if (reason === 'INVALID') value.verifyContext.verified.validation = 'INVALID';
    if (reason === 'scam') value.verifyContext.verified.isScam = true;
    if (reason === 'wrong verified origin') value.verifyContext.verified.origin = 'https://other.example';
    await expect(admit(value)).rejects.toThrow();
    expect(queue.numWcSignRequest).toBe(0);
  });
  it('rejects a local deny-list requester before key export', async () => {
    const approvalId = await admit();
    vi.mocked(checkIfDenied).mockResolvedValueOnce(true);
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow('blocked');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(queue.numWcSignRequest).toBe(0);
  });
  it('rechecks session permission after the asynchronous deny-list check', async () => {
    const approvalId = await admit();
    let done!: (value: boolean) => void;
    vi.mocked(checkIfDenied).mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const approving = extension.wcRequestApprove({ address, approvalId });
    session.namespaces.eip155.methods = [];
    done(false);
    await expect(approving).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('rechecks session permission after querying the provider chain', async () => {
    const approvalId = await admit(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
    vi.mocked(state.getEvmApi).mockReturnValue({
      api: {
        getNetwork: vi.fn(async () => {
          revision += 1;
          return { chainId: 1n };
        }),
      },
    } as never);
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow('context changed');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('requires the same provider instance after its chain check', async () => {
    const approvalId = await admit(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
    const first = { api: { getNetwork: vi.fn(async () => ({ chainId: 1n })) } };
    vi.mocked(state.getEvmApi)
      .mockReturnValueOnce(first as never)
      .mockReturnValue({ api: {} } as never);
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow('provider changed');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('pins the transaction chain at broadcast', async () => {
    const approvalId = await admit(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
    const provider = providerFixture();
    vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
    await expect(extension.wcRequestApprove({ address, approvalId })).resolves.toBe(true);
    expect(provider.broadcastTransaction).toHaveBeenCalledOnce();
    const signed = Transaction.from(provider.broadcastTransaction.mock.calls[0][0]);
    expect(signed.chainId).toBe(1n);
    expect(signed.from).toBe(address);
    expect(signed.value).toBe(1n);
  });
  it('copies the request before delayed network activation', async () => {
    network.active = false;
    let done!: () => void;
    state.setActiveNetworks = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        })
    ) as never;
    const value = event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    incoming.handleRequest(value);
    value.params.request.params[0].value = '0xff';
    network.active = true;
    done();
    await vi.waitFor(() => expect(queue.numWcSignRequest).toBe(1));
    expect(queue.signWcSubject.value[0].params.request.params[0].value).toBe('0x1');
  });
  it('does not queue a request revoked during network activation', async () => {
    network.active = false;
    let done!: () => void;
    state.setActiveNetworks = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        })
    ) as never;
    incoming.handleRequest(event('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]));
    revision += 1;
    network.active = true;
    done();
    await vi.waitFor(() => expect(state.walletConnectService.responseRequest).toHaveBeenCalledOnce());
    expect(queue.numWcSignRequest).toBe(0);
  });
});

describe('WalletConnect live session revisions', () => {
  function service() {
    const listeners = new Map<string, (value: { topic: string }) => void>();
    const service = Object.create(WalletConnectService.prototype) as WalletConnectService;
    const next = vi.fn();
    const disconnect = vi.fn(async () => undefined);
    Object.assign(service, {
      state: {},
      sessionRevisions: new Map(),
      retiredTopics: new Set(),
      expiredRequestIds: new Set(),
      sessionSubject: { next },
      client: {
        session: { values: [] },
        on: (name: string, callback: (value: { topic: string }) => void) => listeners.set(name, callback),
        disconnect,
      },
    });
    (service as unknown as { createListener(): void }).createListener();
    return { service, listeners, disconnect };
  }
  it.each(['session_update', 'session_delete', 'session_expire'])(
    'invalidates the captured revision on %s',
    (event) => {
      const { service: live, listeners } = service();
      expect(live.getSessionRevision('public-topic')).toBe(0);
      listeners.get(event)!({ topic: 'public-topic' });
      listeners.get(event)!({ topic: 'public-topic' });
      expect(live.getSessionRevision('public-topic')).toBe(2);
      expect(live.getSessionRevision('other-topic')).toBe(0);
    }
  );
  it('invalidates local disconnect immediately before awaiting the relay', async () => {
    const { service: live, disconnect } = service();
    let done!: () => void;
    disconnect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        })
    );
    const pending = live.disconnect('public-topic');
    expect(live.getSessionRevision('public-topic')).toBe(1);
    await vi.waitFor(() => expect(done).toBeTypeOf('function'));
    done();
    await pending;
  });
});
