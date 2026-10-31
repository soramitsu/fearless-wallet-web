import { Address } from '@ton/core';
import { describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import { TonProviderRouter } from '@extension-base/services/ton-provider';
import { TonBalance } from '@extension-base/services/ton-balance/TonBalance';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const ADDRESS = 'ton-wallet';
const WALLET = Address.parse(tiResponses.address);
const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const USDT_WALLET = 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT';
const BALANCE_ROUTE = `/api/indexer/v1/accounts/${encodeURIComponent(WALLET.toString())}/balance`;

function tonWalletOnTi() {
  const networkMap: Record<string, NetworkJson> = {};
  mergeUniversalWalletRegistryNetworks(networkMap, undefined);
  const ton = Object.values(networkMap).find(({ ecosystem }) => ecosystem === 'ton')!;
  const fetchFn = vi.fn(async (input: string) => {
    const { pathname } = new URL(input);

    if (pathname === '/api/indexer/v1/service-info') {
      return new Response(JSON.stringify(tiResponses.sourceMainnetServiceInfo), { status: 200 });
    }
    if (pathname === BALANCE_ROUTE) {
      const body = {
        ton: { balance: '2500000000', last_tx_lt: '1' },
        jettons: [{ master: USDT, wallet: USDT_WALLET, balance: '1500000', decimals: 6, symbol: 'USDT' }],
        network: 'mainnet',
      };

      return new Response(JSON.stringify(body), { status: 200 });
    }

    return new Response('{}', { status: 404 });
  });
  const router = new TonProviderRouter(ton, { fetchFn, logger: { info: vi.fn(), warn: vi.fn() } });
  const setBalanceItem = vi.fn();
  const state = {
    keyringService: {
      getSubstrateAddress: (address: string) => address,
      tonKeyring: { accountSubject: { value: { [ADDRESS]: { walletContract: { address: WALLET } } } } },
    },
    networkService: { networkValues: [ton] },
    getTonApiMap: { [ton.name.toLowerCase()]: { api: router } },
    balanceService: { balanceMap: {}, setBalanceItem },
    pricesService: { fiatSymbol: 'usd', setPriceValue: vi.fn(), tonPricingService: { tonParseRates: vi.fn() } },
  } as unknown as State;

  return { fetchFn, setBalanceItem, state, ton };
}

describe('TON refresh through TI', () => {
  it('reads TON and jetton balances from one TI balance request', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { fetchFn, setBalanceItem, state, ton } = tonWalletOnTi();

    const balances = await new TonBalance(state).fetchBalance(ADDRESS, [ton.name]);

    expect(fetchFn.mock.calls.filter(([url]) => new URL(url).pathname === BALANCE_ROUTE)).toHaveLength(1);
    expect(balances).toEqual([
      { balance: '2.5', network: ton.name, assetId: ton.assets[0].id },
      { balance: '1.5', network: ton.name, assetId: Address.parse(USDT).toString() },
    ]);
    expect(setBalanceItem).toHaveBeenCalledWith(
      ton.name,
      expect.objectContaining({ id: ton.assets[0].id, state: APIItemState.READY, total: '2.5' }),
      ADDRESS
    );
  });

  it('asks TI again on the next refresh instead of reusing the earlier answer', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { fetchFn, state, ton } = tonWalletOnTi();
    const service = new TonBalance(state);

    await service.fetchBalance(ADDRESS, [ton.name]);
    await service.fetchBalance(ADDRESS, [ton.name]);

    expect(fetchFn.mock.calls.filter(([url]) => new URL(url).pathname === BALANCE_ROUTE)).toHaveLength(2);
  });
});
