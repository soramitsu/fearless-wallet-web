import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BalanceService from '@extension-base/services/balance-service';
import {
  BALANCE_POLL_MS,
  OTHER_WALLETS_START_DELAY_MS,
  SubscriptionService,
} from '@extension-base/services/subscription-service';
import { TimeoutService } from '@extension-base/services/timeout-service';
import type State from '@extension-base/background/handlers/State';
import type { ServiceInfo } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@/consts/global', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/consts/global')>()), IS_EXTENSION_SMOKE: false }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));

const CURRENT = { address: 'wallet-a', ethereumAddress: '0xa', walletEcosystem: WalletEcosystem.Substrate, name: 'A', isMobile: false };

function subscriptionFixture(otherWallets: { address: string; meta: Record<string, unknown> }[] = []) {
  const fetchBalance = vi.fn().mockResolvedValue([]);
  const subscribeSubstrateBalances = vi.fn().mockReturnValue([]);
  const state = {
    requestService: { mutateAuthorizations: vi.fn().mockResolvedValue(undefined) },
    currentAccount: { ...CURRENT },
    keyringService: { getAllMainAccounts: vi.fn(() => [{ address: CURRENT.address, meta: {} }, ...otherWallets]) },
    networkService: {
      activeNetworkByEcosystem: {
        substrate: [], substrateList: ['polkadot'], evmList: ['ethereum'], tonList: [], solanaList: ['solana'], bitcoinList: ['bitcoin'], irohaList: [],
      },
    },
    serviceInfoSubject: new Subject<ServiceInfo>(),
    timeoutService: new TimeoutService({} as State),
    cronService: { updateCron: vi.fn() },
    nftService: { publishNfts: vi.fn() },
    getSubstrateApiMap: {},
    balanceService: { generateDefaultBalance: vi.fn(), fetchBalance, substrateBalanceService: { subscribeSubstrateBalances } },
  };
  const service = new SubscriptionService(state as unknown as State);

  return { state, service, fetchBalance, subscribeSubstrateBalances };
}

const info = (): ServiceInfo =>
  ({ currentAccountInfo: { ...CURRENT }, apiMap: { substrate: { polkadot: {} }, evm: { ethereum: {} }, ton: {} } }) as unknown as ServiceInfo;

/** Starts the service and lets it make its first read of the selected wallet. */
async function started(fixture: ReturnType<typeof subscriptionFixture>) {
  await fixture.service.start();
  fixture.state.serviceInfoSubject.next(info());
  await vi.advanceTimersByTimeAsync(50);
  fixture.fetchBalance.mockClear();
  fixture.subscribeSubstrateBalances.mockClear();
}

const ecosystemsRead = (fetchBalance: ReturnType<typeof vi.fn>) =>
  fetchBalance.mock.calls.map(([request]) => [...(request.only as Set<string>)][0]).sort();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the selected wallet first', () => {
  it('reads the selected wallet as soon as the worker starts, and the other wallets a little later', async () => {
    const fixture = subscriptionFixture([{ address: 'wallet-b', meta: { walletEcosystem: WalletEcosystem.Substrate } }]);

    await fixture.service.start();
    fixture.state.serviceInfoSubject.next(info());
    await vi.advanceTimersByTimeAsync(50);

    const readFor = () => fixture.fetchBalance.mock.calls.map(([request]) => request.address);
    expect(readFor()).toEqual(['wallet-a']);

    await vi.advanceTimersByTimeAsync(OTHER_WALLETS_START_DELAY_MS);
    expect(readFor()).toEqual(['wallet-a', 'wallet-b']);
  });

  it('does not read the other wallets for a start that was stopped meanwhile', async () => {
    const fixture = subscriptionFixture([{ address: 'wallet-b', meta: { walletEcosystem: WalletEcosystem.Substrate } }]);

    await fixture.service.start();
    fixture.service.stop();
    await vi.advanceTimersByTimeAsync(OTHER_WALLETS_START_DELAY_MS * 2);

    expect(fixture.fetchBalance.mock.calls.map(([request]) => request.address)).not.toContain('wallet-b');
  });
});

describe('reading the selected wallet again', () => {
  it('reads nothing before the first read of the wallet has started', async () => {
    const fixture = subscriptionFixture();

    await fixture.service.start();
    await expect(fixture.service.refreshCurrentWallet({ force: true })).resolves.toBe(false);
    expect(fixture.fetchBalance).not.toHaveBeenCalled();
  });

  it('reads each polled ecosystem when its interval has passed, and never Substrate, which is live', async () => {
    const fixture = subscriptionFixture();
    await started(fixture);

    await fixture.service.refreshCurrentWallet();
    expect(fixture.fetchBalance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS[WalletEcosystem.Evm]);
    await fixture.service.refreshCurrentWallet();
    expect(ecosystemsRead(fixture.fetchBalance)).toEqual(['evm', 'solana', 'ton']);
    expect(fixture.fetchBalance.mock.calls.every(([request]) => request.force === false && request.substrateNetworks.length === 0)).toBe(true);
    expect(fixture.subscribeSubstrateBalances).not.toHaveBeenCalled();

    fixture.fetchBalance.mockClear();
    await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS[WalletEcosystem.Bitcoin]);
    await fixture.service.refreshCurrentWallet();
    expect(ecosystemsRead(fixture.fetchBalance)).toEqual(['bitcoin', 'evm', 'iroha', 'solana', 'ton']);
  });

  it('has a page that opens read again what is older than a moment', async () => {
    const fixture = subscriptionFixture();
    await started(fixture);

    await vi.advanceTimersByTimeAsync(10_000);
    await fixture.service.refreshCurrentWallet({ maxAgeMs: 20_000 });
    expect(fixture.fetchBalance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    await fixture.service.refreshCurrentWallet({ maxAgeMs: 20_000 });
    expect(ecosystemsRead(fixture.fetchBalance)).toEqual(['bitcoin', 'evm', 'iroha', 'solana', 'ton']);
  });

  it('reads everything at once on Refresh, forcing the EVM read and subscribing the Substrate balances again', async () => {
    const fixture = subscriptionFixture();
    await started(fixture);

    await expect(fixture.service.refreshCurrentWallet({ force: true })).resolves.toBe(true);

    expect(ecosystemsRead(fixture.fetchBalance)).toEqual(['bitcoin', 'evm', 'iroha', 'solana', 'ton']);
    expect(fixture.fetchBalance.mock.calls.every(([request]) => request.force === true)).toBe(true);
    expect(fixture.subscribeSubstrateBalances).toHaveBeenCalledOnce();
    expect(fixture.subscribeSubstrateBalances.mock.calls[0][0]).toMatchObject({ address: 'wallet-a', substrateNetworks: ['polkadot'] });
  });

  it('does not read an ecosystem twice while it is being read; Refresh waits for that read', async () => {
    const fixture = subscriptionFixture();
    await started(fixture);
    let finishEvm!: () => void;
    fixture.fetchBalance.mockImplementation(({ only }: { only: Set<string> }) =>
      only.has(WalletEcosystem.Evm) ? new Promise((resolve) => (finishEvm = () => resolve([]))) : Promise.resolve([])
    );

    await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS[WalletEcosystem.Evm]);
    void fixture.service.refreshCurrentWallet();
    await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS[WalletEcosystem.Evm]);
    void fixture.service.refreshCurrentWallet();
    expect(fixture.fetchBalance.mock.calls.filter(([request]) => request.only.has(WalletEcosystem.Evm))).toHaveLength(1);

    let refreshed = false;
    const refresh = fixture.service.refreshCurrentWallet({ force: true }).then(() => (refreshed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshed).toBe(false);
    expect(fixture.fetchBalance.mock.calls.filter(([request]) => request.only.has(WalletEcosystem.Evm))).toHaveLength(1);

    finishEvm();
    await refresh;
    expect(refreshed).toBe(true);
  });

  it('starts the intervals again from a full read after a wallet switch', async () => {
    const fixture = subscriptionFixture();
    await started(fixture);
    await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS[WalletEcosystem.Evm] - 1_000);

    fixture.state.currentAccount = { ...CURRENT, address: 'wallet-b' };
    fixture.state.serviceInfoSubject.next({ ...info(), currentAccountInfo: { ...CURRENT, address: 'wallet-b' } } as unknown as ServiceInfo);
    await vi.advanceTimersByTimeAsync(1_000);
    fixture.fetchBalance.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);
    await fixture.service.refreshCurrentWallet();
    expect(fixture.fetchBalance).not.toHaveBeenCalled();
  });
});

describe('reading only some ecosystems', () => {
  function balanceFixture(meta: Record<string, unknown>) {
    const state = {
      isReady: () => true,
      keyringService: { getAllMainAccounts: () => [{ address: 'wallet-a', meta }] },
      networkService: { networkMap: {}, networkValues: [] },
    };
    const service = new BalanceService(state as unknown as State);
    const spies = {
      evm: vi.spyOn(service.evmBalanceService, 'fetchBalance').mockResolvedValue([]),
      substrate: vi.spyOn(service.substrateBalanceService, 'fetchBalance').mockResolvedValue([]),
      solana: vi.spyOn(service.solanaBalanceService, 'fetchBalance').mockResolvedValue([]),
      bitcoin: vi.spyOn(service.bitcoinBalanceService, 'fetchBalance').mockResolvedValue([]),
      ton: vi.spyOn(service.tonBalanceService, 'fetchBalance').mockResolvedValue([]),
      iroha: vi.spyOn(service.irohaBalanceService, 'fetchBalance').mockResolvedValue([]),
    };

    return { service, spies };
  }

  const request = { address: 'wallet-a', ethereumAddress: '0xa', evmNetworks: ['ethereum'], substrateNetworks: ['polkadot'] };

  it('reads EVM and Substrate together for a Substrate wallet, so the slower one does not hold the other back', async () => {
    const { service, spies } = balanceFixture({ walletEcosystem: WalletEcosystem.Substrate });
    spies.evm.mockReturnValue(new Promise(() => undefined));

    void service.fetchBalance({ ...request, walletEcosystem: WalletEcosystem.Substrate });
    await Promise.resolve();

    expect(spies.substrate).toHaveBeenCalledOnce();
  });

  it('calls only the services asked for, and passes Refresh on to the EVM read', async () => {
    const { service, spies } = balanceFixture({ walletEcosystem: WalletEcosystem.Substrate });

    await service.fetchBalance({ ...request, walletEcosystem: WalletEcosystem.Substrate, only: new Set([WalletEcosystem.Evm]), force: true });

    expect(spies.evm).toHaveBeenCalledWith(expect.objectContaining({ force: true, networks: ['ethereum'] }));
    expect(spies.substrate).not.toHaveBeenCalled();
  });

  it('never calls a service that was not asked for: an empty network list would read its default network', async () => {
    const universal = {
      universalWallet: {
        publicAccounts: [
          { ecosystem: WalletEcosystem.Substrate, address: 'wallet-a' },
          { ecosystem: WalletEcosystem.Evm, address: '0xa' },
          { ecosystem: WalletEcosystem.Solana, address: 'sol' },
          { ecosystem: WalletEcosystem.Bitcoin, address: 'bc1', chainId: 'bitcoin:mainnet' },
        ],
      },
    };
    const { service, spies } = balanceFixture(universal);

    await service.fetchBalance({ ...request, only: new Set([WalletEcosystem.Solana]) });

    expect(spies.solana).toHaveBeenCalledOnce();
    expect(spies.substrate).not.toHaveBeenCalled();
    expect(spies.evm).not.toHaveBeenCalled();
    expect(spies.bitcoin).not.toHaveBeenCalled();

    const single = balanceFixture({ walletEcosystem: WalletEcosystem.Bitcoin });
    await single.service.fetchBalance({ ...request, walletEcosystem: WalletEcosystem.Bitcoin, only: new Set([WalletEcosystem.Evm]) });
    expect(single.spies.bitcoin).not.toHaveBeenCalled();
  });

  it('tells the pages how far the search for tokens is, with the balances', async () => {
    const progress = { total: 80, checked: 12, unreachable: 1, running: true };
    const state = {
      currentAccount: { address: 'wallet-a' },
      assetDiscoverySweepService: { getProgress: () => progress },
    };
    const service = new BalanceService(state as unknown as State);

    await expect(service.getBalance()).resolves.toMatchObject({ details: [], discovery: progress });
  });
});
