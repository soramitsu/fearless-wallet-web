import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transaction, Wallet } from 'ethers';
import { base58Decode } from '@polkadot/util-crypto';
import { checkIfDenied } from '@polkadot/phishing';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import Extension from '@extension-base/background/handlers/Extension';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { SigningRequestKind } from '@extension-base/services/request-service/signingRequestId';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const mocks = vi.hoisted(() => ({ capability: vi.fn(), solanaBroadcast: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));
vi.mock('@extension-base/services/send-kill-switch-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@extension-base/services/send-kill-switch-service')>()),
  assertSendCapability: mocks.capability,
}));
vi.mock('@extension-base/services/solana-rpc-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@extension-base/services/solana-rpc-service')>()),
  createClusterBoundSolanaRpcClient: () => ({ sendRawTransaction: mocks.solanaBroadcast }),
}));

// Public, unfunded test keys. Every network call is a stub.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const address = wallet.address;
const solanaAddress = vectors.vectors[0].expected.solana.address;
const url = 'https://public.example';
const auth = { isAllowed: true, evmAuthorizedAccount: address, currentEvmNetworkKey: 'Ethereum' };
const network = {
  name: 'Ethereum',
  chainId: '1',
  genesisHash: '0x1234',
  isEthereum: true,
  ecosystem: 'ethereum',
  disabled: false,
  assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
};
let evm: EvmRequestHandler;
let solana: SolanaRequestHandler;
let state: State;
let extension: Extension;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};
const outcome = <T>(result: Promise<T>) =>
  result.then(
    (value) => ({ value }),
    (error: Error) => ({ error: error.message })
  );
const evmProvider = () => ({
  getNetwork: vi.fn(async () => ({ chainId: 1n })),
  getTransactionCount: vi.fn(async () => 0),
  estimateGas: vi.fn(async () => 21000n),
  getFeeData: vi.fn(async () => ({ gasPrice: 1n, maxFeePerGas: null, maxPriorityFeePerGas: null })),
  // The wallet sends with eth_sendRawTransaction alone.
  send: vi.fn(async (_method: string, _params: unknown[]): Promise<unknown> => null),
});
async function queueEvm(method: string, params: unknown[], page?: AbortSignal) {
  const context = await captureEvmSigningContext(state, url, method, params);
  // Wrapped so that awaiting the queueing does not wait for the dApp's answer.
  return { dapp: outcome(evm.confirmSign('first', url, method, params, context, page)) };
}
// A legacy System Program transfer of one lamport that the wallet's Solana account signs.
function solanaTransactionBase64(): string {
  const message = [
    1, 0, 1, 3, ...base58Decode(solanaAddress), ...new Uint8Array(32).fill(2), ...new Uint8Array(32),
    ...new Uint8Array(32).fill(7), 1, 2, 2, 0, 1, 12, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
  ];
  return Buffer.from(Uint8Array.from([1, ...new Uint8Array(64), ...message])).toString('base64');
}
function queueSolana(method: 'signAndSendTransaction' | 'signTransaction', page?: AbortSignal) {
  const request = { origin: 'Public fixture', transactionBase64: solanaTransactionBase64() };
  const account = { address: solanaAddress, name: 'Public fixture', publicKey: solanaAddress };
  return outcome(
    method === 'signAndSendTransaction'
      ? solana.confirmSignAndSendTransaction(url, request, account, 'first', undefined, undefined, page)
      : solana.confirmSignTransaction(url, request, account, 'first', page)
  );
}

beforeEach(() => {
  vi.mocked(checkIfDenied).mockResolvedValue(false);
  mocks.capability.mockReset().mockResolvedValue(undefined);
  mocks.solanaBroadcast.mockReset().mockResolvedValue('public-signature');
  const service = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
  } as unknown as RequestService;
  evm = new EvmRequestHandler({ popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService);
  solana = new SolanaRequestHandler(service);
  Object.assign(service, {
    evmRequestHandler: evm,
    solanaRequestHandler: solana,
    getSignRequest: (id: string, kind?: SigningRequestKind) =>
      kind === 'solana'
        ? solana.getSolanaSignRequest(id)
        : (evm.getEvmSignRequest(id) ?? solana.getSolanaSignRequest(id)),
  });
  state = {
    requestService: service,
    getAuthInfo: vi.fn(async () => auth),
    getEvmAuthorizationSnapshot: () => ({ authorization: auth, revision: 0 }),
    getEvmApi: vi.fn(() => undefined),
    networkService: { networkMap: { Ethereum: network } },
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getSubstrateAddress: vi.fn(() => 'substrate-root'),
      getEthereumAddress: vi.fn(() => address),
      isMobileAccount: vi.fn(() => false),
      getAllAccounts: vi.fn(() => [
        {
          address: 'substrate-root',
          meta: {
            name: 'Public fixture',
            ethereumAddress: address,
            solanaAddress,
            walletEcosystem: 'substrate',
            walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION,
          },
        },
      ]),
      getAddresses: vi.fn(() => []),
      getAddress: vi.fn(() => undefined),
      getPassword: () => '',
      exportMnemonic: vi.fn(() => ({ seed: vectors.vectors[0].mnemonic })),
      accountExportPrivateKey: vi.fn(() => ({ privateKey: wallet.privateKey })),
    },
  } as unknown as State;
  extension = new Extension(state);
});
afterEach(() => vi.restoreAllMocks());

describe('cancelling a request whose transaction an approval is submitting', () => {
  it('keeps an EVM transaction whose broadcast is in flight and gives the dApp its hash', async () => {
    const { dapp } = await queueEvm('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    const provider = evmProvider();
    const broadcast = deferred<unknown>();
    provider.send.mockReturnValueOnce(broadcast.promise);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
    const approving = extension.signEvmApprove({ id: 'first' });
    await vi.waitFor(() => expect(provider.send).toHaveBeenCalledOnce());

    expect(extension.signingCancel({ id: 'first', kind: 'evm' })).toBe(false);
    expect(evm.getEvmSignRequest('first')).toBeDefined();

    const [method, [serialized]] = provider.send.mock.calls[0] as [string, [string]];
    const sent = Transaction.from(serialized);
    expect(method).toBe('eth_sendRawTransaction');
    broadcast.resolve(sent.hash);
    expect(await approving).toBe(true);
    expect(await dapp).toEqual({ value: { id: 'first', payload: sent.hash } });
    expect(sent.from).toBe(address);
  });

  it('keeps a Solana sign-and-send whose broadcast is in flight and gives the dApp its signature', async () => {
    const dapp = queueSolana('signAndSendTransaction');
    const broadcast = deferred<string>();
    mocks.solanaBroadcast.mockReturnValueOnce(broadcast.promise);
    const approving = extension.signSolanaApprove({ id: 'first' });
    await vi.waitFor(() => expect(mocks.solanaBroadcast).toHaveBeenCalledOnce());

    expect(extension.signingCancel({ id: 'first', kind: 'solana' })).toBe(false);
    expect(solana.getSolanaSignRequest('first')).toBeDefined();

    broadcast.resolve('landed-signature');
    expect(await approving).toBe(true);
    expect(await dapp).toMatchObject({ value: { publicKey: solanaAddress, signature: 'landed-signature' } });
  });

  it('still cancels a transaction no approval has started', async () => {
    const { dapp: evmDapp } = await queueEvm('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    expect(extension.signingCancel({ id: 'first', kind: 'evm' })).toBe(true);
    expect(await evmDapp).toEqual({ error: 'Cancelled' });

    const solanaDapp = queueSolana('signAndSendTransaction');
    expect(extension.signingCancel({ id: 'first', kind: 'solana' })).toBe(true);
    expect(await solanaDapp).toEqual({ error: 'Cancelled' });
  });

  it('still cancels a request whose approval the wallet refused before it began', async () => {
    const dapp = queueSolana('signAndSendTransaction');
    vi.mocked(state.keyringService.getAllAccounts).mockReturnValue([
      { address: 'substrate-root', meta: { name: 'Public fixture', solanaAddress, walletSecurityGeneration: 0 } },
    ] as never);

    await expect(extension.signSolanaApprove({ id: 'first' })).rejects.toThrow('recovery-only');
    expect(extension.signingCancel({ id: 'first', kind: 'solana' })).toBe(true);
    expect(await dapp).toEqual({ error: 'Cancelled' });
  });

  it('still cancels a sign-only request while its approval runs, so nothing is signed', async () => {
    const dapp = queueSolana('signTransaction');
    const check = deferred<boolean>();
    vi.mocked(checkIfDenied).mockReturnValueOnce(check.promise);
    const approving = extension.signSolanaApprove({ id: 'first' });

    expect(extension.signingCancel({ id: 'first', kind: 'solana' })).toBe(true);
    check.resolve(false);
    expect(await approving).toBe(false);
    expect(await dapp).toEqual({ error: 'Cancelled' });
    expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
  });
});

describe('closing the page whose request an approval is submitting', () => {
  it('leaves an EVM transaction whose broadcast is in flight to finish', async () => {
    const page = new AbortController();
    const { dapp } = await queueEvm('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }], page.signal);
    const provider = evmProvider();
    const broadcast = deferred<{ hash: string }>();
    provider.broadcastTransaction.mockReturnValueOnce(broadcast.promise);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
    const approving = extension.signEvmApprove({ id: 'first' });
    await vi.waitFor(() => expect(provider.broadcastTransaction).toHaveBeenCalledOnce());

    page.abort();
    expect(evm.getEvmSignRequest('first')).toBeDefined();

    broadcast.resolve({ hash: '0xfeed' });
    expect(await approving).toBe(true);
    expect(await dapp).toEqual({ value: { id: 'first', payload: '0xfeed' } });
  });

  it('drops an EVM transaction whose approval then ends without sending it', async () => {
    const page = new AbortController();
    const { dapp } = await queueEvm('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }], page.signal);
    const provider = evmProvider();
    const chain = deferred<{ chainId: bigint }>();
    provider.getNetwork.mockReturnValueOnce(chain.promise);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: provider } as never);
    const approving = extension.signEvmApprove({ id: 'first' });
    await vi.waitFor(() => expect(provider.getNetwork).toHaveBeenCalledOnce());

    page.abort();
    chain.resolve({ chainId: 137n });

    await expect(approving).rejects.toThrow('reviewed network');
    expect(await dapp).toEqual({ error: 'Cancelled' });
    expect(evm.getEvmSignRequest('first')).toBeUndefined();
    expect(provider.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('leaves a Solana sign-and-send whose broadcast is in flight to finish', async () => {
    const page = new AbortController();
    const dapp = queueSolana('signAndSendTransaction', page.signal);
    const broadcast = deferred<string>();
    mocks.solanaBroadcast.mockReturnValueOnce(broadcast.promise);
    const approving = extension.signSolanaApprove({ id: 'first' });
    await vi.waitFor(() => expect(mocks.solanaBroadcast).toHaveBeenCalledOnce());

    page.abort();
    expect(solana.getSolanaSignRequest('first')).toBeDefined();

    broadcast.resolve('landed-signature');
    expect(await approving).toBe(true);
    expect(await dapp).toMatchObject({ value: { publicKey: solanaAddress, signature: 'landed-signature' } });
  });

  it('cancels a request no approval holds, and a sign-only one under approval, so nothing is signed', async () => {
    const page = new AbortController();
    const transaction = [{ from: address, to: address, value: '0x1' }];
    const { dapp: transfer } = await queueEvm('eth_sendTransaction', transaction, page.signal);
    page.abort();
    expect(await transfer).toEqual({ error: 'Cancelled' });

    const signOnly = new AbortController();
    const dapp = queueSolana('signTransaction', signOnly.signal);
    const check = deferred<boolean>();
    vi.mocked(checkIfDenied).mockReturnValueOnce(check.promise);
    const approving = extension.signSolanaApprove({ id: 'first' });
    signOnly.abort();
    check.resolve(false);

    expect(await approving).toBe(false);
    expect(await dapp).toEqual({ error: 'Cancelled' });
    expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
  });
});
