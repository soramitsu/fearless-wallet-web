import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StakingStore } from '@/stores/staking';
import { actions } from '@/stores/staking/actions';

const mocks = vi.hoisted(() => ({
  accounts: { selectedWallet: { address: 'old-wallet' } },
  getStakingParams: vi.fn(),
  getMyStakingInfo: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/extension/messaging', () => ({
  getStakingParams: mocks.getStakingParams,
  getMyStakingInfo: mocks.getMyStakingInfo,
}));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left.toLowerCase() === right.toLowerCase() }));

function setup() {
  return {
    ...actions,
    allStakingNetworks: [{ network: 'sora', loading: false, totalStake: '5' }],
  } as unknown as StakingStore;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.accounts.selectedWallet.address = 'old-wallet';
  mocks.getStakingParams.mockReset().mockResolvedValue([{ network: 'sora', totalStake: '7' }]);
  mocks.getMyStakingInfo.mockReset().mockResolvedValue({ totalStake: '8' });
});
afterEach(() => vi.useRealTimers());

describe('staking store account-bound requests', () => {
  it('skips a scheduled full refresh when the wallet changes before its delay ends', async () => {
    const store = setup();
    const pending = store.getStakingParams({ delay: 5000 });
    mocks.accounts.selectedWallet.address = 'new-wallet';
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    expect(mocks.getStakingParams).not.toHaveBeenCalled();
    expect(store.allStakingNetworks[0].totalStake).toBe('5');
  });

  it('discards an old-wallet response while a new-wallet refresh is in flight', async () => {
    const store = setup();
    const oldResponse = deferred<Array<{ network: string; totalStake: string }>>();
    mocks.getStakingParams.mockReturnValueOnce(oldResponse.promise);
    const oldPending = store.getStakingParams();
    await vi.advanceTimersByTimeAsync(0);
    mocks.accounts.selectedWallet.address = 'new-wallet';
    const newPending = store.getStakingParams({ delay: 5000 });
    oldResponse.resolve([{ network: 'sora', totalStake: '999' }]);
    await oldPending;
    expect(store.allStakingNetworks[0]).toMatchObject({ totalStake: '5', loading: true });
    await vi.advanceTimersByTimeAsync(5000);
    await newPending;
    expect(store.allStakingNetworks[0]).toMatchObject({ totalStake: '7', loading: false });
  });

  it('keeps the newest same-wallet full refresh when responses arrive out of order', async () => {
    const store = setup();
    const oldResponse = deferred<Array<{ network: string; totalStake: string }>>();
    mocks.getStakingParams.mockReturnValueOnce(oldResponse.promise);
    const oldPending = store.getStakingParams();
    await vi.advanceTimersByTimeAsync(0);
    const newPending = store.getStakingParams();
    await vi.advanceTimersByTimeAsync(0);
    await newPending;
    oldResponse.resolve([{ network: 'sora', totalStake: '999' }]);
    await oldPending;
    expect(store.allStakingNetworks[0].totalStake).toBe('7');
  });

  it('rejects a current full-refresh failure and clears its loading state', async () => {
    const store = setup();
    mocks.getStakingParams.mockRejectedValue(new Error('RPC unavailable'));
    const result = expect(store.getStakingParams()).rejects.toThrow('RPC unavailable');
    await vi.advanceTimersByTimeAsync(0);
    await result;
    expect(store.allStakingNetworks[0]).toMatchObject({ totalStake: '5', loading: false });
  });

  it('settles obsolete request failures without changing the new wallet loading state', async () => {
    const store = setup();
    const oldResponse = deferred<never>();
    mocks.getStakingParams.mockReturnValueOnce(oldResponse.promise);
    const pending = store.getStakingParams();
    await vi.advanceTimersByTimeAsync(0);
    mocks.accounts.selectedWallet.address = 'new-wallet';
    oldResponse.reject(new Error('old-wallet failure'));
    await expect(pending).resolves.toBeUndefined();
    expect(store.allStakingNetworks[0].loading).toBe(true);
  });

  it('skips a delayed staking-info lookup after selection changes', async () => {
    const store = setup();
    const pending = store.getMyStakingInfo({ network: 'sora' });
    mocks.accounts.selectedWallet.address = 'new-wallet';
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(mocks.getMyStakingInfo).not.toHaveBeenCalled();
  });

  it('does not commit delayed staking-info from a previously selected account', async () => {
    const store = setup();
    const response = deferred<{ totalStake: string }>();
    mocks.getMyStakingInfo.mockReturnValue(response.promise);
    const pending = store.getMyStakingInfo({ network: 'sora' });
    await vi.advanceTimersByTimeAsync(10_000);
    mocks.accounts.selectedWallet.address = 'new-wallet';
    response.resolve({ totalStake: '999' });
    await pending;
    expect(store.allStakingNetworks[0].totalStake).toBe('5');
  });

  it('keeps the latest same-wallet staking-info request', async () => {
    const store = setup();
    const first = store.getMyStakingInfo({ network: 'sora' });
    const second = store.getMyStakingInfo({ network: 'sora' });
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);
    expect(mocks.getMyStakingInfo).toHaveBeenCalledTimes(1);
    expect(store.allStakingNetworks[0].totalStake).toBe('8');
  });

  it('invalidates delayed staking-info when a newer full refresh starts', async () => {
    const store = setup();
    const info = store.getMyStakingInfo({ network: 'sora' });
    const params = store.getStakingParams();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([info, params]);
    expect(mocks.getMyStakingInfo).not.toHaveBeenCalled();
    expect(store.allStakingNetworks[0].totalStake).toBe('7');
  });

  it('exposes delayed staking-info failures through its returned promise', async () => {
    const store = setup();
    mocks.getMyStakingInfo.mockRejectedValue(new Error('staking info unavailable'));
    const result = expect(store.getMyStakingInfo({ network: 'sora' })).rejects.toThrow('staking info unavailable');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });
});
