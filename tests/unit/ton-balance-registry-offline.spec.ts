import { describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

const ADDRESS = 'ton-wallet';
const WALLET_CONTRACT = { address: 'ton-wallet-contract' };

// What the background has when the GitHub registry request failed: only the bundled networks, none from GitHub.
function offlineTonWallet(getAccountBalance: () => Promise<{ balance: bigint; hasActivity: boolean }>) {
  const networkMap: Record<string, NetworkJson> = {};
  mergeUniversalWalletRegistryNetworks(networkMap, undefined);
  const ton = Object.values(networkMap).find(({ ecosystem }) => ecosystem === 'ton')!;
  const provider = {
    getAccountBalance: vi.fn(getAccountBalance),
    getJettonBalances: vi.fn(async () => ({ holdings: [], complete: false })),
  };
  const state = {
    keyringService: {
      getAllMainAccounts: () => [{ address: ADDRESS, meta: {} }],
      getSubstrateAddress: (address: string) => address,
      tonKeyring: { accountSubject: { value: { [ADDRESS]: { walletContract: WALLET_CONTRACT } } } },
    },
    networkService: { networksGithub: [], networkMap, networkValues: Object.values(networkMap) },
    getTonApiMap: { [ton.name.toLowerCase()]: { api: provider } },
    pricesService: { fiatSymbol: 'usd', setPriceValue: vi.fn(), tonPricingService: { tonParseRates: vi.fn() } },
    timeoutService: { lazyNext: vi.fn() },
  } as unknown as State;
  const service = new BalanceService(state);
  (state as unknown as { balanceService: BalanceService }).balanceService = service;
  service.generateDefaultBalance(ADDRESS, WalletEcosystem.Ton);
  const tonRow = () =>
    service.balanceMap[ADDRESS].flatMap(({ balances }) => balances).find(({ id }) => id === ton.assets[0].id)!;

  return { provider, refresh: () => service.tonBalanceService.fetchBalance(ADDRESS, [ton.name]), ton, tonRow };
}

describe('TON balance while the GitHub registry is unavailable', () => {
  it('is read through the bundled TON network', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { provider, refresh, ton, tonRow } = offlineTonWallet(async () => ({
      balance: 5_000_000_000n,
      hasActivity: true,
    }));

    await expect(refresh()).resolves.toEqual([{ balance: '5', network: ton.name, assetId: ton.assets[0].id }]);
    expect(provider.getAccountBalance).toHaveBeenCalledWith(WALLET_CONTRACT.address);
    expect(tonRow()).toMatchObject({ state: APIItemState.READY, total: '5', transferable: '5' });
  });

  it('marks the balance failed, without an amount, when the provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { refresh, tonRow } = offlineTonWallet(async () => {
      throw new Error('ton_provider_unavailable');
    });

    await expect(refresh()).resolves.toEqual([]);
    expect(tonRow().state).toBe(APIItemState.ERROR);
    expect(tonRow().total).toBeUndefined();
  });
});
