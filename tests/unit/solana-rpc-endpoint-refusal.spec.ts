import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import BalanceService from '@extension-base/services/balance-service';
import SolanaBalanceService from '@extension-base/services/balance-service/SolanaBalanceService';
import { createSolanaRpcBalanceClient } from '@extension-base/services/balance-service/solanaRpcBalances';
import { SolanaRpcClient } from '@extension-base/services/solana-rpc-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import type {
  SolanaTokenBalance,
  SolanaWalletBalancesResponse,
} from '@extension-base/services/solana-indexer-service';
import { UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS } from '@/consts/solanaRpc';
import { WalletEcosystem } from '@/interfaces';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SIGNATURE = '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN';
const [MAINNET_BETA, PUBLICNODE, DRPC] = UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS.mainnet;
const noWait = { sleep: async () => undefined };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const rpcResult = (id: number, result: unknown) => jsonResponse({ id, jsonrpc: '2.0', result });

type Answer = (body: { id: number; method: string }) => Response;

/**
 * The production endpoints as they answered an extension origin on 2026-10-10: the public mainnet
 * node refuses every request carrying an Origin header with 403, publicnode serves balances but refuses token
 * accounts with 403, and drpc's free plan answers 400 for Solana.
 */
const PRODUCTION_FROM_AN_EXTENSION: Record<string, Answer> = {
  [MAINNET_BETA]: () => jsonResponse({ jsonrpc: '2.0', error: { code: 403, message: 'Access forbidden' } }, 403),
  [PUBLICNODE]: ({ id, method }) =>
    method === 'getTokenAccountsByOwner'
      ? new Response('Request blocked', { status: 403 })
      : method === 'sendTransaction'
        ? rpcResult(id, SIGNATURE)
        : rpcResult(id, { context: { slot: 1 }, value: 2_500_000_000 }),
  [DRPC]: () => jsonResponse({ message: 'chain is not available on free plan' }, 400),
};

function endpoints(answers: Record<string, Answer>) {
  const posts: Array<{ method: string; url: string }> = [];
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    const url = input.toString().replace(/\/$/u, '');

    posts.push({ method: body.method, url });

    return answers[url](body);
  });

  return { client: new SolanaRpcClient({ fetchFn, network: 'mainnet', failover: noWait }), posts };
}

describe('Solana JSON-RPC endpoints that refuse the extension', () => {
  it('reads the balance from the next endpoint after a 403, instead of giving up', async () => {
    const { client, posts } = endpoints(PRODUCTION_FROM_AN_EXTENSION);

    await expect(client.getBalance(WALLET)).resolves.toBe(2_500_000_000);
    expect(posts.map(({ url }) => url)).toEqual([MAINNET_BETA, PUBLICNODE]);
  });

  it('fails over on 401 the same way (a key or a paid plan is required)', async () => {
    const { client, posts } = endpoints({
      ...PRODUCTION_FROM_AN_EXTENSION,
      [MAINNET_BETA]: () => new Response('Unauthorized', { status: 401 }),
    });

    await expect(client.getBalance(WALLET)).resolves.toBe(2_500_000_000);
    expect(posts.map(({ url }) => url)).toEqual([MAINNET_BETA, PUBLICNODE]);
  });

  it('keeps asking the endpoint that served, not the last one that refused', async () => {
    const { client, posts } = endpoints(PRODUCTION_FROM_AN_EXTENSION);

    await client.getBalance(WALLET);
    posts.length = 0;
    // Every endpoint refuses token accounts, drpc's free plan with a 400. None of them is an answer to the call.
    await expect(client.getTokenAccountsByOwner(WALLET, SPL_TOKEN_PROGRAM)).rejects.toMatchObject({
      name: 'SolanaRpcError',
      message: expect.stringMatching(/^solana_rpc_http_40[03]$/u),
    });
    expect(new Set(posts.map(({ url }) => url))).toEqual(new Set([MAINNET_BETA, PUBLICNODE, DRPC]));
    posts.length = 0;

    await expect(client.getBalance(WALLET)).resolves.toBe(2_500_000_000);
    expect(posts.map(({ url }) => url)).toEqual([PUBLICNODE]);
  });

  it('shows SOL when only the token accounts are refused, and says the tokens were not read', async () => {
    const { client } = endpoints(PRODUCTION_FROM_AN_EXTENSION);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const balances = await createSolanaRpcBalanceClient(client).getBalances(WALLET);

    expect(balances).toMatchObject({
      native: { lamports: '2500000000', uiAmountString: '2.5' },
      tokens: [],
      tokensUnavailable: true,
    });
    warn.mockRestore();
  });

  it('broadcasts through the next endpoint after a refusal, and a refusal is never "maybe sent"', async () => {
    const { client, posts } = endpoints(PRODUCTION_FROM_AN_EXTENSION);
    const signed = Buffer.from([
      1,
      ...new Uint8Array(64).fill(7),
      ...[1, 0, 1, 2],
      ...new Uint8Array(32).fill(1),
      ...new Uint8Array(32),
      ...new Uint8Array(32).fill(9),
      ...[1, 1, 1, 0, 0],
    ]).toString('base64');

    await expect(client.sendRawTransaction(signed)).resolves.toBe(SIGNATURE);
    expect(posts.map(({ url }) => url)).toEqual([MAINNET_BETA, PUBLICNODE]);

    const refusedEverywhere = endpoints({
      [MAINNET_BETA]: PRODUCTION_FROM_AN_EXTENSION[MAINNET_BETA],
      [PUBLICNODE]: () => new Response('Request blocked', { status: 403 }),
      [DRPC]: PRODUCTION_FROM_AN_EXTENSION[DRPC],
    });

    await expect(refusedEverywhere.client.sendRawTransaction(signed)).rejects.toMatchObject({
      ambiguous: false,
      message: 'solana_broadcast_rejected',
    });
    expect(refusedEverywhere.posts).toHaveLength(3);
  });
});

describe('Solana token rows when the token accounts cannot be read', () => {
  const networks = createUniversalWalletRegistryNetworks().map((network) => ({ ...network, active: !network.disabled }));
  const networkMap = Object.fromEntries(networks.map((network) => [network.name, network])) as Record<string, NetworkJson>;
  const ADDRESS = 'wallet-address';
  const usdc: SolanaTokenBalance = {
    accountAddress: '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5',
    amount: '12500000',
    decimals: 6,
    delegatedAmount: null,
    isNative: false,
    mint: USDC_MINT,
    owner: WALLET,
    program: 'spl-token',
    programId: SPL_TOKEN_PROGRAM,
    rentExemptReserve: null,
    state: 'initialized',
    type: 'token',
    uiAmountString: '12.5',
  };
  const response = (sol: string, tokens: SolanaTokenBalance[], tokensUnavailable?: boolean): SolanaWalletBalancesResponse => ({
    native: { decimals: 9, lamports: '0', mint: 'SOL', type: 'native', uiAmountString: sol },
    syncedAt: 1,
    tokens,
    total: tokens.length + 1,
    wallet: WALLET,
    ...(tokensUnavailable ? { tokensUnavailable } : {}),
  });

  beforeEach(() => {
    storageMock.get.mockReset().mockResolvedValue({ assetBalances: {}, networkScanStates: {} });
    storageMock.set.mockReset().mockResolvedValue(undefined);
  });

  function startBackground(answers: SolanaWalletBalancesResponse[]) {
    const state = {
      networkService: { activeNetworkByEcosystem: { solana: [networkMap.Solana] }, networkMap, networkValues: networks },
      timeoutService: { lazyNext: (_key: string, callback: () => void) => callback() },
    } as unknown as State;
    const balanceService = new BalanceService(state);
    Object.assign(state, { balanceService });
    balanceService.balanceMap[ADDRESS] = getMockAssets(networkMap, WalletEcosystem.Solana);
    const getBalances = vi.fn(async () => answers.shift()!);
    const solana = new SolanaBalanceService(state, { getBalances });
    const fetch = () => solana.fetchBalance({ address: ADDRESS, solanaAddress: WALLET, networks: ['solana'] });
    const balanceOf = (id: string) =>
      balanceService.balanceMap[ADDRESS].flatMap(({ balances }) => balances).find((balance) => balance.id === id && balance.name === 'Solana');

    return { fetch, balanceOf };
  }

  it('keeps the token amount last read, marked as not updated, while SOL updates', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fetch, balanceOf } = startBackground([response('2.5', [usdc]), response('3', [], true)]);

    await fetch();
    expect(balanceOf(USDC_MINT)).toMatchObject({ state: APIItemState.READY, total: '12.5' });

    const answered = await fetch();

    expect(balanceOf('SOL')).toMatchObject({ state: APIItemState.READY, total: '3', scanCoverage: 'limited' });
    // Not zeroed by the unread list: the last amount stays, flagged so the row says it is not current.
    expect(balanceOf(USDC_MINT)).toMatchObject({ state: APIItemState.ERROR, total: '12.5' });
    expect(answered).toEqual(
      expect.arrayContaining([
        { assetId: 'SOL', balance: '3', network: 'Solana' },
        { assetId: USDC_MINT, balance: '12.5', network: 'Solana' },
      ])
    );
    warn.mockRestore();
  });

  it('still zeroes a token that a complete read no longer lists', async () => {
    const { fetch, balanceOf } = startBackground([response('2.5', [usdc]), response('2.5', [])]);

    await fetch();
    await fetch();

    expect(balanceOf('SOL')).toMatchObject({ state: APIItemState.READY, scanCoverage: 'complete' });
    expect(balanceOf(USDC_MINT)).toMatchObject({ state: APIItemState.READY, total: '0' });
  });
});
