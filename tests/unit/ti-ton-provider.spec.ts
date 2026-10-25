import { Address, beginCell } from '@ton/core';
import { TiTonProvider } from '@extension-base/services/ton-provider';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';

const TI = 'https://ti.soramitsu.io';
const ADDRESS = Address.parse(tiResponses.address);
const ACCOUNT = `/api/indexer/v1/accounts/${tiResponses.address}`;
const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const USDT_WALLET = 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT';

type Route = { status: number; body: unknown };

const asMainnet = (route: Route): Route => ({ ...route, body: { ...(route.body as object), network: 'mainnet' } });

function ti(routes: Record<string, Route>, serviceInfo: Record<string, unknown> = {}) {
  const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    const all: Record<string, Route> = {
      'GET /api/indexer/v1/service-info': { status: 200, body: { ...tiResponses.sourceMainnetServiceInfo, ...serviceInfo } },
      ...routes,
    };
    const { status, body } = all[key] ?? { status: 404, body: { statusCode: 404 } };

    return new Response(JSON.stringify(body), { status });
  });

  return { fetchFn, provider: new TiTonProvider(TI, 'mainnet', fetchFn) };
}

describe('TI adapter (TONSWAP indexer routes)', () => {
  it('reads nothing before TI has proven the network', async () => {
    const { fetchFn, provider } = ti({});

    await expect(provider.getAccountBalance(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_unverified' });
    await expect(provider.sendMessage(beginCell().endCell())).rejects.toMatchObject({ code: 'ton_provider_unverified' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses the service-info TI serves today and the testnet one its source would serve', async () => {
    await expect(ti({ 'GET /api/indexer/v1/service-info': tiResponses.deployed.serviceInfo }).provider.verify()).rejects.toMatchObject({
      code: 'ton_provider_unverified',
    });
    await expect(ti({}, { chainId: 'ton:testnet', network: 'testnet' }).provider.verify()).rejects.toMatchObject({
      code: 'ton_provider_unverified',
      detail: 'TI serves ton:testnet (testnet), not ton:mainnet',
    });
  });

  it('reads the TON balance and whether the address was ever used from its balance route', async () => {
    const { provider } = ti({
      [`GET ${ACCOUNT}/balance`]: asMainnet(tiResponses.deployed.balance),
    });
    await provider.verify();

    await expect(provider.getAccountBalance(ADDRESS)).resolves.toEqual({ balance: 218_928_460_686n, hasActivity: true });

    const fresh = ti({
      [`GET ${ACCOUNT}/balance`]: {
        status: 200,
        body: { ton: { balance: '0' }, jettons: [], confirmed: true, updated_at: 1, network: 'mainnet' },
      },
    });
    await fresh.provider.verify();
    await expect(fresh.provider.getAccountBalance(ADDRESS)).resolves.toEqual({ balance: 0n, hasActivity: false });
  });

  it('rejects every answer that names another network', async () => {
    const { provider } = ti({
      [`GET ${ACCOUNT}/balance`]: tiResponses.deployed.balance,
      [`GET ${ACCOUNT}/state`]: tiResponses.deployed.state,
      [`GET ${ACCOUNT}/txs?page=1`]: tiResponses.deployed.txsPage1,
    });
    await provider.verify();

    await expect(provider.getAccountBalance(ADDRESS)).rejects.toMatchObject({
      code: 'ton_provider_network_mismatch',
      detail: 'asked for TON mainnet, TI answered testnet',
    });
    await expect(provider.getJettonBalances(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_network_mismatch' });
    await expect(provider.getWalletState(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_network_mismatch' });
    await expect(provider.getHistory(ADDRESS, 100)).rejects.toMatchObject({ code: 'ton_provider_network_mismatch' });
  });

  it('lists the jettons TI indexes as a partial, unpriced list and skips one without decimals', async () => {
    const { provider } = ti({
      [`GET ${ACCOUNT}/balance`]: {
        status: 200,
        body: {
          ton: { balance: '1' },
          jettons: [
            { master: USDT, wallet: USDT_WALLET, balance: '1500000', decimals: 6, symbol: 'USDT' },
            { master: USDT_WALLET, wallet: USDT, balance: '5', symbol: 'ODD' },
          ],
          confirmed: true,
          updated_at: 1,
          network: 'mainnet',
        },
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await provider.verify();

    const { holdings, complete } = await provider.getJettonBalances(ADDRESS);

    expect(complete).toBe(false);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ balance: 1_500_000n, decimals: 6, symbol: 'USDT', verified: false });
    expect(holdings[0].master.equals(Address.parse(USDT))).toBe(true);
    expect(holdings[0].wallet.equals(Address.parse(USDT_WALLET))).toBe(true);
    await expect(provider.getRates()).resolves.toBeUndefined();
  });

  it('turns its transaction history into wallet events', async () => {
    const { provider } = ti({ [`GET ${ACCOUNT}/txs?page=1`]: asMainnet(tiResponses.deployed.txsPage1) });
    await provider.verify();

    const events = await provider.getHistory(ADDRESS, 100);
    const [first] = tiResponses.deployed.txsPage1.body.txs;

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ eventId: first.txId, timestamp: first.utime });
    expect(events[0].actions).toHaveLength(1);

    const [{ sender, recipient, ...transfer }] = events[0].actions as Extract<
      (typeof events)[0]['actions'][number],
      { type: 'ton-transfer' }
    >[];

    expect(transfer).toEqual({ type: 'ton-transfer', success: false, amount: '100000000' });
    expect(sender?.equals(Address.parse(first.actions[0].from!))).toBe(true);
    expect(recipient?.equals(ADDRESS)).toBe(true);
  });

  it('reads the wallet seqno with a get-method only for a deployed wallet', async () => {
    const state = (accountState: string | null): Route => ({
      status: 200,
      body: { address: tiResponses.address, account_state: accountState, network: 'mainnet' },
    });
    const seqno: Route = { status: 200, body: { exit_code: 0, gas_used: 1, stack: [['num', '0x7']] } };

    const active = ti({ [`GET ${ACCOUNT}/state`]: state('active'), 'POST /api/indexer/v1/runGetMethod': seqno });
    await active.provider.verify();
    await expect(active.provider.getWalletState(ADDRESS)).resolves.toEqual({ seqno: 7, deployed: true });
    expect(JSON.parse(String(active.fetchFn.mock.calls.at(-1)![1]!.body))).toEqual({
      address: ADDRESS.toString(),
      method: 'seqno',
      stack: [],
    });

    const fresh = ti({ [`GET ${ACCOUNT}/state`]: state('uninitialized') });
    await fresh.provider.verify();
    await expect(fresh.provider.getWalletState(ADDRESS)).resolves.toEqual({ seqno: 0, deployed: false });

    const frozen = ti({ [`GET ${ACCOUNT}/state`]: state('frozen') });
    await frozen.provider.verify();
    await expect(frozen.provider.getWalletState(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_invalid_response' });

    const brokenActive = ti({ [`GET ${ACCOUNT}/state`]: state('active') });
    await brokenActive.provider.verify();
    await expect(brokenActive.provider.getWalletState(ADDRESS)).rejects.toMatchObject({ code: 'ton_provider_request_failed' });
  });

  it('does not send through a read-only TI', async () => {
    const { fetchFn, provider } = ti({});
    await provider.verify();

    expect(provider.canBroadcast).toBe(false);
    await expect(provider.sendMessage(beginCell().endCell())).rejects.toMatchObject({ code: 'ton_broadcast_unavailable' });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('reports a rejected sendBoc as a failure', async () => {
    const { provider } = ti(
      { 'POST /api/v2/jsonRPC': { status: 200, body: { id: 1, jsonrpc: '2.0', ok: false, code: 500, error: 'Upstream RPC error.' } } },
      { readOnly: false }
    );
    await provider.verify();

    await expect(provider.sendMessage(beginCell().endCell())).rejects.toMatchObject({
      code: 'ton_provider_request_failed',
      detail: 'sendBoc: Upstream RPC error.',
    });
  });
});
