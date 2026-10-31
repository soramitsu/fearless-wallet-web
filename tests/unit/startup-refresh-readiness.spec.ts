import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '@extension-base/services/subscription-service';
import { TimeoutService } from '@extension-base/services/timeout-service';
import { DOTSAMA_API_TIMEOUT } from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@/consts/global', async (importOriginal) => ({ ...(await importOriginal<object>()), IS_EXTENSION_SMOKE: false }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function fixture() {
  const polkadotReady = deferred();
  const network = (name: string) => ({ name, ecosystem: 'substrate' });
  const refreshed: Array<{ chain: string; address: string; failed: boolean }> = [];
  const state = {
    requestService: { mutateAuthorizations: vi.fn().mockResolvedValue(undefined) },
    currentAccount: { address: 'wallet-a', ethereumAddress: '' },
    keyringService: { getAllMainAccounts: () => [
      { address: 'wallet-a', meta: { walletEcosystem: WalletEcosystem.Substrate } },
      { address: 'wallet-b', meta: { walletEcosystem: WalletEcosystem.Substrate, ethereumAddress: '0xb' } },
      { address: 'ton-wallet', meta: { walletEcosystem: WalletEcosystem.Ton } },
    ] },
    networkService: { activeNetworkByEcosystem: {
      substrate: [network('Polkadot'), network('Kusama')],
      substrateList: ['polkadot', 'kusama'], evmList: ['ethereum'], tonList: ['ton mainnet'], solanaList: [], bitcoinList: [], irohaList: [],
    } },
    // Polkadot loads its metadata late; Kusama never does.
    getSubstrateApiMap: {
      polkadot: { api: { isReadyOrError: polkadotReady.promise } },
      kusama: { api: { isReadyOrError: new Promise(() => undefined) } },
    },
    serviceInfoSubject: new Subject(),
    timeoutService: new TimeoutService({} as State),
    balanceService: {
      balanceMap: {
        'wallet-b': [{ balances: [{ name: 'polkadot' }, { name: 'kusama' }] }],
        'ton-wallet': [{ balances: [{ name: 'ton mainnet' }] }],
      },
      generateDefaultBalance: vi.fn(),
      fetchBalance: vi.fn(),
      refreshNetworkBalances: vi.fn(async (chain: string, address: string, refresh: () => Promise<unknown>) => {
        try {
          await refresh();
          refreshed.push({ chain, address, failed: false });
        } catch (error) {
          refreshed.push({ chain, address, failed: true });
          throw error;
        }
      }),
      substrateBalanceService: { subscribeSubstrateBalances: vi.fn().mockReturnValue([]) },
    },
  };
  return { state, polkadotReady, refreshed, service: new SubscriptionService(state as unknown as State) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('start-up refresh of the other wallets', () => {
  it('reads Substrate balances only from connections that loaded their metadata', async () => {
    const { service, state, polkadotReady } = fixture();

    await service.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.balanceService.fetchBalance).not.toHaveBeenCalled();

    polkadotReady.resolve();
    await vi.advanceTimersByTimeAsync(DOTSAMA_API_TIMEOUT);

    const requests = state.balanceService.fetchBalance.mock.calls.map(([request]) => request);
    expect(requests.map(({ address }) => address)).toEqual(['wallet-b', 'ton-wallet']);
    expect(requests.every(({ substrateNetworks }) => substrateNetworks.join() === 'polkadot')).toBe(true);
    expect(requests[0]).toMatchObject({ evmNetworks: ['ethereum'], tonNetworks: ['ton mainnet'], isFirstRun: true });
  });

  it('marks a network that is not ready by the deadline as not refreshed, for the wallets that hold it', async () => {
    const { service, polkadotReady, refreshed } = fixture();

    await service.start();
    polkadotReady.resolve();
    await vi.advanceTimersByTimeAsync(DOTSAMA_API_TIMEOUT + 1000);

    expect(refreshed).toEqual([{ chain: 'Kusama', address: 'wallet-b', failed: true }]);
  });
});
