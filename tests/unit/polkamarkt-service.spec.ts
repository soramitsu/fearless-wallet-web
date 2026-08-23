import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/contracts/polkamarkt-v1.json';
import { PolkamarktService } from '@/extension/background/extension-base/src/services/polkamarkt-service';

const KUSD_ASSET_ID = '0x02000c0000000000000000000000000000000000000000000000000000000000';
const XOR_ASSET_ID = '0x0200000000000000000000000000000000000000000000000000000000000000';
const allowFinalAuthorization = async () => undefined;

function baseApi(
  balances: Record<string, string> = {},
  {
    marketStatus = 'Open',
    claim = {},
  }: {
    marketStatus?: string;
    claim?: Record<string, unknown>;
  } = {}
) {
  const markets = Object.assign(
    vi.fn((marketId: number) =>
      Promise.resolve({ marketId: String(marketId), status: marketStatus, closeBlock: '120' })
    ),
    { entries: vi.fn().mockResolvedValue([]) }
  );

  return {
    api: {
      query: { polkamarkt: { markets } },
      rpc: {
        chain: { getHeader: vi.fn().mockResolvedValue({ number: fixture.catalog.currentBlock }) },
        assets: {
          usableBalance: vi.fn((_account: string, assetId: string) =>
            Promise.resolve(balances[assetId] ?? '1000000000000000000000000')
          ),
        },
        polkamarkt: {
          quoteBuy: vi.fn((marketId: number, outcome: string, amount: string) => ({
            marketId: String(marketId),
            outcome,
            collateralIn: amount,
            feeAmount: '1000000000000000',
            sharesOut: (BigInt(amount) * 2n).toString(),
          })),
          quoteSell: vi.fn((marketId: number, outcome: string, amount: string) => ({
            marketId: String(marketId),
            outcome,
            sharesIn: amount,
            feeAmount: '1000000000000000',
            collateralOut: amount,
          })),
          marketState: vi.fn().mockResolvedValue(fixture.runtime.marketState),
          claimable: vi.fn((account: string, marketId: number) => ({
            ...fixture.accountActivity.runtimeClaimable,
            account,
            marketId: String(marketId),
            noShares: '2000000000000000000',
            ...claim,
          })),
        },
      },
      tx: {
        polkamarkt: {
          buy: vi.fn((...params) => ({ kind: 'buy', params })),
          sell: vi.fn((...params) => ({ kind: 'sell', params })),
          claimMarket: vi.fn((...params) => ({ kind: 'claimMarket', params })),
          claimCreatorFees: vi.fn((...params) => ({ kind: 'claimCreatorFees', params })),
        },
      },
    },
  };
}

describe('PolkamarktService', () => {
  it('falls back to the reduced legacy GraphQL query and retains client-side order', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ message: fixture.catalog.latestQueryFailure.message }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture.catalog.legacyQueryResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    const service = new PolkamarktService({
      apiRoot: baseApi(),
      indexerUrl: 'https://indexer.example/graphql',
      signable: false,
      authorizeBeforeSubmit: allowFinalAuthorization,
      fetchFn,
      rawRpc: vi.fn().mockImplementation(async (method) =>
        method === 'rpc_methods'
          ? { methods: ['polkamarkt_quoteBuy', 'polkamarkt_quoteSell', 'polkamarkt_marketState'] }
          : null
      ),
      submit: vi.fn(),
      estimateFee: vi.fn().mockResolvedValue('1'),
    });

    const snapshot = await service.snapshot();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(snapshot.markets.map((market) => market.id)).toEqual(['7', '8']);
    expect(snapshot.markets[1].displayStatus).toBe('closed');
    expect(snapshot.indexerStale).toBe(false);
    expect(snapshot.account.reason).toBe('Add a SORA account to trade or claim.');
  });

  it('quotes values above Number.MAX_SAFE_INTEGER through raw integer RPC parameters', async () => {
    const quoteFixture = fixture.quotes[0];
    const rawRpc = vi.fn().mockResolvedValue(quoteFixture.response);
    const estimateFee = vi.fn().mockResolvedValue('1000000000000000');
    const service = new PolkamarktService({
      apiRoot: baseApi(),
      endpoint: 'wss://sora.example',
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      rawRpc,
      submit: vi.fn(),
      estimateFee,
    });

    const quote = await service.quote({ marketId: '7', mode: 'buy', outcome: 'Yes', amount: '1.000000000000000001' });
    expect(rawRpc).toHaveBeenCalledWith('polkamarkt_quoteBuy', [
      7,
      'Yes',
      { rawInteger: '1000000000000000001' },
    ]);
    expect(quote).toMatchObject({
      amount: '1.000000000000000001',
      feeAmount: '0.001',
      networkFee: '0.001',
      resultAmount: '1.800000000000000002',
    });
    expect(estimateFee).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'buy', params: [7, 'Yes', '1000000000000000001', expect.any(String)] })
    );
  });

  it('gates mutations on disclaimer acceptance and signability', async () => {
    const submit = vi.fn().mockResolvedValue({ hash: '0x01' });
    let disclaimerAccepted = false;
    const service = new PolkamarktService({
      apiRoot: baseApi(),
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => disclaimerAccepted,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1'),
    });
    await expect(
      service.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: true })
    ).resolves.toMatchObject({ status: false, error: expect.stringContaining('disclaimer') });
    expect(submit).not.toHaveBeenCalled();

    disclaimerAccepted = true;
    await expect(
      service.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: false })
    ).resolves.toEqual({ status: true, hash: '0x01' });
    expect(submit).toHaveBeenCalledWith({ kind: 'claimMarket', params: [7] });
  });

  it('keeps public browsing available for watch-only wallets while mutations fail explicitly', async () => {
    const service = new PolkamarktService({
      apiRoot: baseApi(),
      accountAddress: 'cnWatchOnly',
      signable: false,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit: vi.fn(),
      estimateFee: vi.fn().mockResolvedValue('0'),
    });
    await expect(
      service.mutate({ action: 'claimCreatorFees', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'This SORA account cannot sign in this wallet.' });
  });

  it('refreshes capabilities, market, quote, balances, and fee before final authorization', async () => {
    const apiRoot = baseApi();
    const estimateFee = vi.fn().mockResolvedValue('1000000000000000');
    const rawRpc = vi.fn();
    const callOrder: string[] = [];
    const authorizeBeforeSubmit = vi.fn(async () => {
      callOrder.push('authorize');
    });
    const submit = vi.fn(async () => {
      callOrder.push('submit');
      return { hash: '0xfinal' };
    });
    const service = new PolkamarktService({
      apiRoot,
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit,
      rawRpc,
      submit,
      estimateFee,
    });

    await expect(service.mutate({
      action: 'buy',
      marketId: '7',
      mode: 'buy',
      outcome: 'Yes',
      amount: '1',
      minimumResult: '1.98',
      disclaimerAccepted: true,
    })).resolves.toEqual({ status: true, hash: '0xfinal' });

    expect(apiRoot.api.query.polkamarkt.markets).toHaveBeenCalledTimes(2);
    expect(apiRoot.api.rpc.polkamarkt.quoteBuy).toHaveBeenCalledTimes(2);
    expect(apiRoot.api.rpc.assets.usableBalance).toHaveBeenCalledTimes(4);
    expect(estimateFee).toHaveBeenCalledTimes(2);
    expect(rawRpc.mock.calls.filter(([method]) => method === 'rpc_methods')).toHaveLength(2);
    expect(authorizeBeforeSubmit).toHaveBeenCalledOnce();
    expect(authorizeBeforeSubmit).toHaveBeenCalledWith(expect.objectContaining({
      accountAddress: 'cnTrader',
      networkFeeCodec: '1000000000000000',
      request: expect.objectContaining({ action: 'buy', marketId: '7' }),
      extrinsic: expect.objectContaining({ kind: 'buy' }),
    }));
    expect(callOrder).toEqual(['authorize', 'submit']);
  });

  it('rejects runtime facts that become stale only at final revalidation', async () => {
    const authorizeBeforeSubmit = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn();

    const closedApi = baseApi();
    closedApi.api.query.polkamarkt.markets
      .mockResolvedValueOnce({ marketId: '7', status: 'Open', closeBlock: '120' })
      .mockResolvedValueOnce({ marketId: '7', status: 'Closed', closeBlock: '120' });
    const closedService = new PolkamarktService({
      apiRoot: closedApi,
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });
    await expect(closedService.mutate({
      action: 'buy',
      marketId: '7',
      mode: 'buy',
      outcome: 'Yes',
      amount: '1',
      minimumResult: '1.98',
      disclaimerAccepted: true,
    })).resolves.toEqual({ status: false, error: 'This market is no longer open. Refresh before trading.' });

    const balanceApi = baseApi();
    let kusdReads = 0;
    balanceApi.api.rpc.assets.usableBalance.mockImplementation((_account: string, assetId: string) => {
      if (assetId === KUSD_ASSET_ID) {
        kusdReads += 1;
        return Promise.resolve(kusdReads === 1 ? '10000000000000000000' : '0');
      }
      return Promise.resolve('10000000000000000000');
    });
    const balanceService = new PolkamarktService({
      apiRoot: balanceApi,
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });
    await expect(balanceService.mutate({
      action: 'buy',
      marketId: '7',
      mode: 'buy',
      outcome: 'Yes',
      amount: '1',
      minimumResult: '1.98',
      disclaimerAccepted: true,
    })).resolves.toEqual({ status: false, error: 'Add enough KUSD for the order and its current market fee.' });

    const feeService = new PolkamarktService({
      apiRoot: baseApi(),
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn()
        .mockResolvedValueOnce('1000000000000000')
        .mockResolvedValueOnce('0'),
    });
    await expect(feeService.mutate({
      action: 'buy',
      marketId: '7',
      mode: 'buy',
      outcome: 'Yes',
      amount: '1',
      minimumResult: '1.98',
      disclaimerAccepted: true,
    })).resolves.toEqual({ status: false, error: 'Refresh the current XOR network fee.' });

    expect(authorizeBeforeSubmit).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('rechecks claimability and mandatory background authorization before submit', async () => {
    const apiRoot = baseApi();
    let claimReads = 0;
    apiRoot.api.rpc.polkamarkt.claimable.mockImplementation((account: string, marketId: number) => {
      claimReads += 1;
      return {
        ...fixture.accountActivity.runtimeClaimable,
        account,
        marketId: String(marketId),
        claimablePayout: claimReads === 1 ? '1000000000000000000' : '0',
        traderPayout: claimReads === 1 ? '1000000000000000000' : '0',
      };
    });
    const authorizeBeforeSubmit = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn();
    const claimService = new PolkamarktService({
      apiRoot,
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });
    await expect(
      claimService.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'There is no trader payout to claim.' });
    expect(authorizeBeforeSubmit).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    const deniedGuard = vi.fn().mockRejectedValue(new Error('Polkamarkt actions are temporarily paused.'));
    const deniedSubmit = vi.fn();
    const deniedService = new PolkamarktService({
      apiRoot: baseApi(),
      accountAddress: 'cnTrader',
      signable: true,
      isDisclaimerAccepted: () => true,
      authorizeBeforeSubmit: deniedGuard,
      rawRpc: vi.fn(),
      submit: deniedSubmit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });
    await expect(
      deniedService.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'Polkamarkt actions are temporarily paused.' });
    expect(deniedGuard).toHaveBeenCalledOnce();
    expect(deniedSubmit).not.toHaveBeenCalled();
  });

  it('rechecks exact XOR and KUSD balances before every direct mutation submit', async () => {
    const submit = vi.fn().mockResolvedValue({ hash: '0x01' });
    const xorMissing = new PolkamarktService({
      apiRoot: baseApi({ [XOR_ASSET_ID]: '0', [KUSD_ASSET_ID]: '10000000000000000000' }),
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });

    await expect(
      xorMissing.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'Add enough XOR to pay the current SORA network fee.' });
    expect(submit).not.toHaveBeenCalled();

    const kusdMissing = new PolkamarktService({
      apiRoot: baseApi({ [XOR_ASSET_ID]: '1000000000000000000', [KUSD_ASSET_ID]: '999999999999999999' }),
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });

    await expect(
      kusdMissing.mutate({
        action: 'buy',
        marketId: '7',
        mode: 'buy',
        outcome: 'Yes',
        amount: '1',
        minimumResult: '1.98',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: false, error: 'Add enough KUSD for the order and its current market fee.' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not require KUSD for a sell when exact XOR fees are funded', async () => {
    const submit = vi.fn().mockResolvedValue({ hash: '0x02' });
    const service = new PolkamarktService({
      apiRoot: baseApi({ [XOR_ASSET_ID]: '1000000000000000000', [KUSD_ASSET_ID]: '0' }),
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    });

    await expect(
      service.mutate({
        action: 'sell',
        marketId: '7',
        mode: 'sell',
        outcome: 'No',
        amount: '1',
        minimumResult: '0.99',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: true, hash: '0x02' });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('rejects a stale caller minimum and a market that closed after the UI snapshot', async () => {
    const submit = vi.fn();
    const common = {
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    };
    const staleQuote = new PolkamarktService({ apiRoot: baseApi(), ...common });

    await expect(
      staleQuote.mutate({
        action: 'buy',
        marketId: '7',
        mode: 'buy',
        outcome: 'Yes',
        amount: '1',
        minimumResult: '1.9',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: false, error: 'The market quote changed. Review the new minimum before confirming.' });

    const closed = new PolkamarktService({
      apiRoot: baseApi({}, { marketStatus: 'Closed' }),
      ...common,
    });
    await expect(
      closed.mutate({
        action: 'buy',
        marketId: '7',
        mode: 'buy',
        outcome: 'Yes',
        amount: '1',
        minimumResult: '1.98',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: false, error: 'This market is no longer open. Refresh before trading.' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('requires the current market fee in exact KUSD and exact outcome shares for sells', async () => {
    const submit = vi.fn();
    const options = {
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    };
    const feeMissing = new PolkamarktService({
      apiRoot: baseApi({ [KUSD_ASSET_ID]: '1000000000000000000', [XOR_ASSET_ID]: '1000000000000000000' }),
      ...options,
    });
    await expect(
      feeMissing.mutate({
        action: 'buy',
        marketId: '7',
        mode: 'buy',
        outcome: 'Yes',
        amount: '1',
        minimumResult: '1.98',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: false, error: 'Add enough KUSD for the order and its current market fee.' });

    const sharesMissing = new PolkamarktService({
      apiRoot: baseApi(
        { [KUSD_ASSET_ID]: '0', [XOR_ASSET_ID]: '1000000000000000000' },
        { claim: { noShares: '999999999999999999' } }
      ),
      ...options,
    });
    await expect(
      sharesMissing.mutate({
        action: 'sell',
        marketId: '7',
        mode: 'sell',
        outcome: 'No',
        amount: '1',
        minimumResult: '0.99',
        disclaimerAccepted: true,
      })
    ).resolves.toEqual({ status: false, error: 'The order exceeds the available market shares.' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('rechecks authoritative trader and creator claimability before direct submission', async () => {
    const submit = vi.fn();
    const options = {
      accountAddress: 'cnTrader',
      signable: true,
      authorizeBeforeSubmit: allowFinalAuthorization,
      isDisclaimerAccepted: () => true,
      rawRpc: vi.fn(),
      submit,
      estimateFee: vi.fn().mockResolvedValue('1000000000000000'),
    };
    const noTraderPayout = new PolkamarktService({
      apiRoot: baseApi({}, { claim: { claimablePayout: '0', traderPayout: '0' } }),
      ...options,
    });
    await expect(
      noTraderPayout.mutate({ action: 'claimMarket', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'There is no trader payout to claim.' });

    const noCreatorFees = new PolkamarktService({
      apiRoot: baseApi({}, { claim: { creatorFees: '0' } }),
      ...options,
    });
    await expect(
      noCreatorFees.mutate({ action: 'claimCreatorFees', marketId: '7', disclaimerAccepted: true })
    ).resolves.toEqual({ status: false, error: 'There are no creator fees to claim.' });
    expect(submit).not.toHaveBeenCalled();
  });
});
