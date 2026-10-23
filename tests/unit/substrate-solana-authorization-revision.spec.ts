import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import { Keyring } from '@polkadot/keyring';
import { base58Decode, cryptoWaitReady } from '@polkadot/util-crypto';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AuthUrls, SignRequest } from '@extension-base/background/types/types';
import type { SolanaRequestsSubjectPayload } from '@extension-base/services/request-service/types';

const mocks = vi.hoisted(() => ({ data: {} as AuthUrls, denied: vi.fn(), capability: vi.fn(), broadcast: vi.fn() }));
vi.mock('@extension-base/services/send-kill-switch-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@extension-base/services/send-kill-switch-service')>()),
  assertSendCapability: mocks.capability,
}));
vi.mock('@extension-base/services/solana-rpc-service', async (importOriginal) => {
  class InterceptedRpcClient {
    sendRawTransaction = mocks.broadcast;
  }

  return {
    ...(await importOriginal<typeof import('@extension-base/services/solana-rpc-service')>()),
    SolanaRpcClient: InterceptedRpcClient,
    createClusterBoundSolanaRpcClient: () => new InterceptedRpcClient(),
  };
});
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    getAndWait(key: string): Promise<AuthUrls> {
      return new Promise((resolve) => this.get(key, resolve));
    }
    setAndWait(key: string, value: AuthUrls): Promise<void> {
      return new Promise((resolve) => this.set(key, value, resolve));
    }
    get(_key: string, update: (data: AuthUrls) => void) {
      update(mocks.data);
    }
    set(_key: string, data: AuthUrls, update?: () => void) {
      mocks.data = data;
      update?.();
    }
  },
}));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

const url = 'https://public.example';
let substrateAddress: string;
let pair: ReturnType<Keyring['addFromUri']>;
beforeAll(async () => {
  await cryptoWaitReady();
  pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  substrateAddress = pair.address;
});
const solanaAddress = vectors.vectors[0].expected.solana.address;
const grant = () =>
  ({
    [url]: {
      id: 'public-grant',
      count: 0,
      isAllowed: true,
      origin: url,
      url,
      authorizedAccounts: [substrateAddress],
      solanaAuthorizedAccount: solanaAddress,
      evmAuthorizedAccount: '',
      allowedAccountsMap: {},
    },
  }) as AuthUrls;
let state: State,
  auth: AuthRequestHandler,
  substrate: SubstrateRequestHandler,
  solana: SolanaRequestHandler,
  extension: Extension;
beforeEach(async () => {
  mocks.data = grant();
  mocks.denied.mockReset().mockResolvedValue(false);
  mocks.capability.mockReset().mockResolvedValue(undefined);
  mocks.broadcast.mockReset().mockResolvedValue('public-signature');
  const service = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: (origin: string, address: string) => auth.ensureAccountAuthorized(origin, address),
    getAuthList: () => auth.getAuthList(),
  } as unknown as RequestService;
  state = {
    requestService: service,
    getAuthInfo: async () => (await auth.getAuthList())[url],
    networkService: {},
    keyringService: {
      encodeAddress: (address: string) => address,
      getAllAccounts: vi.fn(() => [
        {
          address: substrateAddress,
          publicKey: pair.addressRaw,
          meta: { name: 'Public fixture', solanaAddress, walletEcosystem: 'substrate' },
        },
      ]),
      getPair: vi.fn(() => pair),
      getPassword: () => '',
      exportMnemonic: vi.fn(() => ({ seed: vectors.vectors[0].mnemonic })),
    },
  } as unknown as State;
  auth = new AuthRequestHandler(service, state);
  substrate = new SubstrateRequestHandler(service, state);
  solana = new SolanaRequestHandler(service);
  Object.assign(service, {
    authRequestHandler: auth,
    substrateRequestHandler: substrate,
    solanaRequestHandler: solana,
    getSignRequest: (id: string) => substrate.getSignRequest(id) ?? solana.getSolanaSignRequest(id),
  });
  extension = new Extension(state);
  await auth.getAuthList();
});
async function admit(protocol: 'substrate' | 'solana') {
  const result =
    protocol === 'substrate'
      ? substrate.sign(
          url,
          new RequestBytesSign({ address: substrateAddress, data: '0x1234', type: 'bytes' }),
          { address: substrateAddress, name: 'Public fixture' } as never,
          'public'
        )
      : solana.confirmSignMessage(
          url,
          { origin: 'Public fixture', messageBase64: 'AQIDBA==' },
          { address: solanaAddress, publicKey: solanaAddress },
          'public'
        );
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(state.requestService.getSignRequest('public')).toBeDefined());
  vi.mocked(state.keyringService.getPair).mockClear();
  const request = state.requestService.getSignRequest('public')!;
  const resolve = vi.spyOn(request, 'resolve'),
    reject = vi.spyOn(request, 'reject');
  return { request, result, resolve, reject };
}
describe('Substrate and Solana approval-time site grants', () => {
  it.each(['substrate', 'solana'] as const)(
    'does not expose %s accounts for a malformed truthy grant flag',
    async (protocol) => {
      Object.assign(state.keyringService, {
        accountSubject: {
          value: {
            public: {
              type: 'sr25519',
              json: { address: substrateAddress, meta: { solanaAddress, name: 'Public fixture' } },
            },
          },
        },
        addressSubject: { value: {} },
      });
      const malformed = grant();
      malformed[url].isAllowed = 'false' as unknown as boolean;
      auth.setAuthorize(malformed);
      const tabs = new Tabs(state);
      const accounts =
        protocol === 'solana'
          ? await tabs.solanaAccountsAuthorized(url)
          : await tabs.filterForAuthorizedAccounts([{ address: substrateAddress, type: 'sr25519' }], url);
      expect(accounts).toEqual(protocol === 'solana' ? { accounts: [] } : []);
    }
  );
  it('checks account admission against the current grant after the load barrier', async () => {
    const pending = auth.ensureAccountAuthorized(url, substrateAddress);
    const denied = grant();
    denied[url].isAllowed = false;
    auth.setAuthorize(denied);
    await expect(pending).rejects.toThrow('enabled');
  });
  it.each(['substrate', 'solana'] as const)(
    'does not expose %s accounts after revocation during lookup',
    async (protocol) => {
      Object.assign(state.keyringService, {
        accountSubject: {
          value: {
            public: {
              type: 'sr25519',
              json: { address: substrateAddress, meta: { solanaAddress, name: 'Public fixture' } },
            },
          },
        },
        addressSubject: { value: {} },
      });
      const tabs = new Tabs(state);
      const pending =
        protocol === 'solana'
          ? tabs.solanaAccountsAuthorized(url)
          : tabs.filterForAuthorizedAccounts([{ address: substrateAddress, type: 'sr25519' }], url);
      const denied = grant();
      denied[url].isAllowed = false;
      auth.setAuthorize(denied);
      expect(await pending).toEqual(protocol === 'solana' ? { accounts: [] } : []);
    }
  );
  it('does not let external Substrate completion bypass revoked authorization', async () => {
    const { resolve } = await admit('substrate');
    const denied = grant();
    denied[url].isAllowed = false;
    auth.setAuthorize(denied);
    await expect(extension.signingApproveSignature({ id: 'public', signature: '0x1234' })).rejects.toThrow('enabled');
    expect(resolve).not.toHaveBeenCalled();
  });
  it('does not let external completion bypass a pending Substrate approval', async () => {
    await admit('substrate');
    let finish!: (value: boolean) => void;
    mocks.denied.mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await expect(extension.signingApproveSignature({ id: 'public', signature: '0x1234' })).rejects.toThrow('pending');
    finish(false);
    expect(await pending).toBe(true);
  });
  it.each(['substrate', 'solana'] as const)('signs an unchanged %s grant', async (protocol) => {
    const { result, resolve } = await admit(protocol);
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    await result;
    expect(resolve).toHaveBeenCalledOnce();
  });
  for (const protocol of ['substrate', 'solana'] as const) {
    it.each(['denied', 'account', 'identity', 'removal'] as const)(
      `does not revive a ${protocol} request after changed-away-and-back %s`,
      async (kind) => {
        const { resolve } = await admit(protocol),
          changed = grant();
        if (kind === 'denied') changed[url].isAllowed = false;
        if (kind === 'identity') changed[url].id = 'replacement';
        if (kind === 'account') {
          if (protocol === 'substrate') changed[url].authorizedAccounts = [];
          else changed[url].solanaAuthorizedAccount = '';
        }
        auth.setAuthorize(kind === 'removal' ? {} : changed);
        auth.setAuthorize(grant());
        await extension.signingApprove({ id: 'public' }).catch(() => false);
        expect(resolve).not.toHaveBeenCalled();
        expect(state.keyringService.getPair).not.toHaveBeenCalled();
        expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
      }
    );
    it(`blocks ${protocol} revocation during the phishing await`, async () => {
      const { resolve } = await admit(protocol);
      let finish!: (value: boolean) => void;
      mocks.denied.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const pending = extension.signingApprove({ id: 'public' }).catch(() => false);
      const denied = grant();
      denied[url].isAllowed = false;
      auth.setAuthorize(denied);
      finish(false);
      await pending;
      expect(resolve).not.toHaveBeenCalled();
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
      expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
    });
    it(`does not invalidate ${protocol} signing when an unrelated protocol changes`, async () => {
      const { result, resolve } = await admit(protocol),
        changed = grant();
      if (protocol === 'substrate') changed[url].solanaAuthorizedAccount = 'another-solana-account';
      else changed[url].authorizedAccounts = ['another-substrate-account'];
      auth.setAuthorize(changed);
      expect(await extension.signingApprove({ id: 'public' })).toBe(true);
      await result;
      expect(resolve).toHaveBeenCalledOnce();
    });
    it(`refuses legacy ${protocol} requests without an admission revision`, async () => {
      const { request, resolve } = await admit(protocol);
      delete (request as (SignRequest | SolanaRequestsSubjectPayload) & { authorizationRevision?: number })
        .authorizationRevision;
      await extension.signingApprove({ id: 'public' }).catch(() => false);
      expect(resolve).not.toHaveBeenCalled();
    });
  }
  it('rechecks Substrate authorization after an asynchronous signer returns', async () => {
    const { request, resolve } = await admit('substrate');
    let finish!: (value: { signature: '0x1234' }) => void;
    (request as SignRequest).request.sign = vi.fn(
      () =>
        new Promise<{ signature: '0x1234' }>((done) => {
          finish = done;
        })
    );
    const pending = extension.signingApprove({ id: 'public' }).catch(() => false);
    await vi.waitFor(() => expect(finish).toBeDefined());
    const denied = grant();
    denied[url].isAllowed = false;
    auth.setAuthorize(denied);
    auth.setAuthorize(grant());
    finish({ signature: '0x1234' });
    await pending;
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rechecks Solana authorization before releasing a synchronously generated signature', async () => {
    const { resolve } = await admit('solana');
    vi.mocked(state.keyringService.exportMnemonic).mockImplementation(() => {
      const denied = grant();
      denied[url].isAllowed = false;
      auth.setAuthorize(denied);
      return { seed: vectors.vectors[0].mnemonic } as never;
    });
    await extension.signingApprove({ id: 'public' }).catch(() => false);
    expect(resolve).not.toHaveBeenCalled();
  });
});

async function admitSend() {
  const transactionBase64 = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from([1, 0, 1, 2]),
    Buffer.from(base58Decode(solanaAddress)),
    Buffer.alloc(32),
    Buffer.alloc(32, 9),
    Buffer.from([1, 1, 1, 0, 0]),
  ]).toString('base64');
  const result = solana.confirmSignAndSendTransaction(
    url,
    { origin: 'Public fixture', transactionBase64 },
    { address: solanaAddress, publicKey: solanaAddress },
    'public'
  );
  void result.catch(() => undefined);
  const request = solana.getSolanaSignRequest('public')!;
  return { request, resolve: vi.spyOn(request, 'resolve'), result };
}
describe('Solana sign-and-send authorization boundaries with an intercepted broadcaster', () => {
  it('permits the unchanged grant and broadcasts once', async () => {
    const { result, resolve } = await admitSend();
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    await result;
    expect(resolve).toHaveBeenCalledOnce();
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });
  it.each(['grant', 'account'] as const)('reads current %s after a delayed send-capability check', async (kind) => {
    const { resolve } = await admitSend();
    let finish!: () => void;
    mocks.capability.mockReturnValueOnce(
      new Promise<void>((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await vi.waitFor(() => expect(mocks.capability).toHaveBeenCalledOnce());
    if (kind === 'grant') {
      const denied = grant();
      denied[url].isAllowed = false;
      auth.setAuthorize(denied);
      auth.setAuthorize(grant());
    } else vi.mocked(state.keyringService.getAllAccounts).mockReturnValue([]);
    finish();
    expect(await pending).toBe(false);
    expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rechecks the grant immediately before dispatching a signed transaction', async () => {
    const { resolve } = await admitSend();
    vi.mocked(state.keyringService.exportMnemonic).mockImplementation(() => {
      const denied = grant();
      denied[url].isAllowed = false;
      auth.setAuthorize(denied);
      return { seed: vectors.vectors[0].mnemonic } as never;
    });
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
  it('consumes a stale result after broadcast without releasing it or retrying', async () => {
    const { resolve } = await admitSend();
    let finish!: (signature: string) => void;
    mocks.broadcast.mockReturnValueOnce(
      new Promise<string>((done) => {
        finish = done;
      })
    );
    const pending = extension.signingApprove({ id: 'public' });
    await vi.waitFor(() => expect(mocks.broadcast).toHaveBeenCalledOnce());
    const denied = grant();
    denied[url].isAllowed = false;
    auth.setAuthorize(denied);
    auth.setAuthorize(grant());
    finish('public-signature');
    expect(await pending).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    expect(mocks.broadcast).toHaveBeenCalledOnce();
    expect(solana.getSolanaSignRequest('public')).toBeUndefined();
  });
});
