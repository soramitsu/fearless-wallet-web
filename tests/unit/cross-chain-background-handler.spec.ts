import Extension from '@extension-base/background/handlers/Extension';
import {
  TransferErrorCode,
  type BasicTxResponse,
  type Port,
  type RequestTypes,
} from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { crossChainQuoteTokens } from '@/cross-chain/quoteTokens';
import { CrossChainPreviousSendUnresolvedError } from '@/cross-chain/sendLedger';

const crossChain = vi.hoisted(() => ({
  makeCrossChain: vi.fn(),
  estimateCrossChainQuote: vi.fn(),
  refreshCrossChainOriginBalance: vi.fn(),
  assertCrossChainSignerCapability: vi.fn(),
  assertCrossChainSendAvailable: vi.fn(),
}));
const validation = vi.hoisted(() => ({ validateReviewedCrossChainRequest: vi.fn() }));

vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION: false,
  IS_EXTENSION_SMOKE: false,
}));
vi.mock('@/sora', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({}));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => crossChain);
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers/balance', () => ({}));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({}));
vi.mock('@/helpers', () => ({}));
vi.mock('@/consts/currencies', () => ({}));
vi.mock('@/consts/networks', () => ({ ALL_NETWORKS: 'all' }));
vi.mock('@/cross-chain/requestValidation', () => validation);
vi.mock('@/defi/polkaswapExecutionGuard', () => ({}));
vi.mock('@extension-base/const', () => ({}));
vi.mock('@extension-base/background/handlers/ExtensionBase', () => ({
  default: class {
    constructor(protected state: State) {}
  },
}));

const ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const HASH = 'ab'.repeat(32);
const ROUTE = 'reviewed-v1:wallet-xcm:polkadot:asset-hub:polkadot-dot';

type MakeRequest = RequestTypes['pri(accounts.makeCrossChain)'];

const unsignedRequest = (): MakeRequest =>
  ({
    from: ADDRESS,
    to: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    originNet: 'Polkadot',
    destinationNet: 'Polkadot Asset Hub',
    assetId: 'polkadot-dot',
    assetKey: 'asset-key',
    routeId: ROUTE,
    routeProviderId: 'wallet-xcm',
    amount: '1',
    expectedOriginFee: '0.01',
    expectedDestinationFee: '0.001',
    expectedExecutionFingerprint: 'quote-fingerprint',
    isMobile: false,
  }) as unknown as MakeRequest;

const issueToken = (quoted: MakeRequest) =>
  crossChainQuoteTokens.issue({
    from: quoted.from,
    to: quoted.to,
    amount: quoted.amount ?? '',
    originNet: quoted.originNet,
    destinationNet: quoted.destinationNet,
    assetId: quoted.assetId,
    assetKey: quoted.assetKey,
    routeId: quoted.routeId,
    routeProviderId: quoted.routeProviderId,
    originFee: quoted.expectedOriginFee ?? '',
    destinationFee: quoted.expectedDestinationFee ?? '',
    executionFingerprint: quoted.expectedExecutionFingerprint ?? '',
  });

/** A send request carrying a token the background issued for exactly this quote. */
const request = (): MakeRequest => {
  const quoted = unsignedRequest();

  return { ...quoted, quoteToken: issueToken(quoted) } as MakeRequest;
};

function setup() {
  const pair = { meta: {} };
  const updates: BasicTxResponse[] = [];
  const cancelSubscription = vi.fn(() => true);
  const state = {
    keyringService: { getSubstrateAddress: (address: string) => address, getPair: () => pair },
    getAccountAddress: () => ADDRESS,
    balanceService: { getTokenBalance: () => ({ symbol: 'DOT', balances: [] }) },
    networkService: { networkMap: { Polkadot: {}, 'Polkadot Asset Hub': {} } },
    actionCapabilityService: { isActionEnabled: () => true },
    getSubstrateApiMap: { polkadot: { api: { tag: 'origin-api' } } },
    subscriptionService: {
      createSubscription: () => (update: BasicTxResponse) => updates.push(update),
      cancelSubscription,
    },
  } as unknown as State;
  const listeners: (() => void)[] = [];
  const port = { onDisconnect: { addListener: (listener: () => void) => listeners.push(listener) } } as unknown as Port;

  validation.validateReviewedCrossChainRequest.mockReturnValue({
    action: 'crossChainXcm',
    routeId: ROUTE,
    providerId: 'wallet-xcm',
    xcmAssetId: 'dot',
    execution: { kind: 'relay-native-xcm-v3' },
    minimum: '0.01',
  });

  return {
    cancelSubscription,
    disconnect: () => listeners.forEach((listener) => listener()),
    extension: new Extension(state),
    port,
    updates,
  };
}

describe('cross-chain background handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crossChain.refreshCrossChainOriginBalance.mockResolvedValue(undefined);
    crossChain.assertCrossChainSendAvailable.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers with the tracked outcome of the send, the same one the subscription received', async () => {
    const { extension, updates } = setup();
    const outcome = { status: true, transactionHash: HASH };
    crossChain.makeCrossChain.mockImplementation(async ({ callback }: { callback: (value: BasicTxResponse) => void }) => {
      callback(outcome);

      return outcome;
    });

    await expect(extension.handle('send', 'pri(accounts.makeCrossChain)', request())).resolves.toEqual(outcome);
    expect(updates).toEqual([outcome]);
  });

  it('shows a refused resend as an unknown outcome carrying the earlier hash', async () => {
    const { extension, updates } = setup();
    crossChain.makeCrossChain.mockRejectedValue(new CrossChainPreviousSendUnresolvedError(HASH));
    const expected = {
      status: false,
      outcome: 'unknown',
      transactionHash: HASH,
      errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: 'cross_chain_previous_send_unresolved' }],
    };

    await expect(extension.handle('send', 'pri(accounts.makeCrossChain)', request())).resolves.toEqual(expected);
    expect(updates).toEqual([expected]);
  });

  it('reports a signing rejection without an error object instead of throwing a TypeError', async () => {
    const { extension, updates } = setup();
    crossChain.makeCrossChain.mockRejectedValue(undefined);
    const expected = { status: false, errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: 'undefined' }] };

    await expect(extension.handle('send', 'pri(accounts.makeCrossChain)', request())).resolves.toEqual(expected);
    expect(updates).toEqual([expected]);
  });

  it('closes the subscription once, whether the popup closes first or the outcome arrives first', async () => {
    vi.useFakeTimers();
    const { cancelSubscription, disconnect, extension, port } = setup();
    crossChain.makeCrossChain.mockResolvedValue({ status: true, transactionHash: HASH });

    await extension.handle('send', 'pri(accounts.makeCrossChain)', request(), port);
    disconnect();
    await vi.advanceTimersByTimeAsync(500);
    disconnect();

    expect(cancelSubscription).toHaveBeenCalledOnce();
  });

  it('issues a quote token that allows exactly one send of exactly that quote', async () => {
    const { extension } = setup();
    crossChain.estimateCrossChainQuote.mockResolvedValue({
      originFee: { toString: () => '0.01' },
      destinationFee: { toString: () => '0.001' },
      minimum: { toString: () => '0.01' },
      executionFingerprint: 'quote-fingerprint',
    });
    crossChain.makeCrossChain.mockResolvedValue({ status: true, transactionHash: HASH });

    const quote = await extension.handle(
      'check',
      'pri(accounts.checkCrossChain)',
      unsignedRequest() as RequestTypes['pri(accounts.checkCrossChain)']
    );
    expect(quote).toMatchObject({ estimateFee: '0.01', destEstimateFee: '0.001', executionFingerprint: 'quote-fingerprint' });
    expect(quote.quoteToken).toMatch(/^[0-9a-f]{64}$/);

    const send = { ...unsignedRequest(), quoteToken: quote.quoteToken } as MakeRequest;
    await expect(extension.handle('send', 'pri(accounts.makeCrossChain)', send)).resolves.toMatchObject({ status: true });
    await expect(extension.handle('again', 'pri(accounts.makeCrossChain)', send)).resolves.toEqual({
      status: false,
      errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'cross_chain_quote_token_unknown' }],
    });
    expect(crossChain.makeCrossChain).toHaveBeenCalledOnce();
  });

  it.each([
    ['without a token', () => unsignedRequest(), 'cross_chain_quote_token_required'],
    ['with a token for another amount', () => ({ ...request(), amount: '100' }) as MakeRequest, 'cross_chain_quote_mismatch'],
    ['with a token for another recipient', () => ({ ...request(), to: ADDRESS }) as MakeRequest, 'cross_chain_quote_mismatch'],
  ])('refuses a send %s before touching the network or the signer', async (_label, build, message) => {
    const { extension } = setup();

    await expect(extension.handle('send', 'pri(accounts.makeCrossChain)', build())).resolves.toEqual({
      status: false,
      errors: [{ code: TransferErrorCode.UNSUPPORTED, message }],
    });
    expect(crossChain.refreshCrossChainOriginBalance).not.toHaveBeenCalled();
    expect(crossChain.makeCrossChain).not.toHaveBeenCalled();
  });

  it('keeps the transfer form from offering a route whose earlier send is unresolved', async () => {
    const { extension } = setup();
    crossChain.assertCrossChainSendAvailable.mockRejectedValue(new Error('cross_chain_previous_send_unresolved'));

    await expect(
      extension.handle(
        'check',
        'pri(accounts.checkCrossChain)',
        unsignedRequest() as RequestTypes['pri(accounts.checkCrossChain)']
      )
    ).resolves.toEqual({
      estimateFee: '0',
      destEstimateFee: '0',
      errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'cross_chain_previous_send_unresolved' }],
    });
    expect(crossChain.assertCrossChainSendAvailable).toHaveBeenCalledWith(
      { address: ADDRESS, routeId: ROUTE },
      { tag: 'origin-api' }
    );
    expect(crossChain.estimateCrossChainQuote).not.toHaveBeenCalled();
  });
});
