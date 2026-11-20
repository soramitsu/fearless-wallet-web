import axios, { AxiosError } from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { fetchHistory } from '@/history/fetchingHistory';

vi.mock('@/extension/messaging', () => ({}));
vi.mock('@/extension/messaging/price', () => ({}));

afterEach(() => vi.restoreAllMocks());

describe('registry history providers', () => {
  const url = 'https://indexer.example/graphql';
  const chainId = 'ab'.repeat(32);

  it('reads the SubQuery page inside the GraphQL data envelope', async () => {
    const page = { nodes: [{ id: 'transfer' }], pageInfo: { endCursor: null, startCursor: null } };
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { historyElements: page } } });
    expect(await fetchHistory(url, 'account', 'subquery', 'Astar', 'ASTR', true)).toEqual(page);
  });

  it('retries a timed-out SubQuery request once', async () => {
    vi.useFakeTimers();
    try {
      const page = { nodes: [], pageInfo: { startCursor: null, endCursor: null } };
      const post = vi.spyOn(axios, 'post')
        .mockRejectedValueOnce(new AxiosError('timed out', 'ETIMEDOUT'))
        .mockResolvedValueOnce({ data: { data: { historyElements: page } } });
      const pending = fetchHistory(url, 'account', 'subquery', 'Astar', 'ASTR', true);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toEqual(page);
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves cached history on a GraphQL error', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { errors: [{ message: 'Unavailable' }], data: null } });
    expect(await fetchHistory(url, 'account', 'subquery', 'Astar', 'ASTR', true)).toBeUndefined();
  });

  it('accepts SORA activity only for this account from a recent index of the expected genesis', async () => {
    const health = { genesisHash: '0x' + chainId, workerReady: true, latestIndexedAt: Date.now() / 1000 };
    const rows = [{ id: 'tx', timestamp: 1700000000, address: 'account', execution: { success: false } }];
    const response = { data: { data: { _health: health, historyElements: { nodes: rows } } } };
    vi.spyOn(axios, 'post').mockResolvedValue(response);
    const read = () => fetchHistory(url, 'account', 'soraSubquery', 'SORA Mainnet', 'XOR', true, undefined, chainId);
    expect(await read()).toEqual(rows);
    rows[0].address = 'other';
    expect(await read()).toBeUndefined();
    rows[0].address = 'account';
    health.latestIndexedAt -= 7200;
    expect(await read()).toBeUndefined();
    health.latestIndexedAt = Date.now() / 1000;
    health.workerReady = false;
    expect(await read()).toBeUndefined();
    health.workerReady = true;
    health.genesisHash = '0x00';
    expect(await read()).toBeUndefined();
  });

  it('loads SORA history from its catalog URL and stores activity by asset on the selected chain', async () => {
    setActivePinia(createPinia());
    const store = useNetworksStore();
    const name = 'SORA Mainnet';
    const assets = [
      { id: 'native', symbol: 'xor', isUtility: true },
      { id: 'validator', symbol: 'val' },
      { id: 'token', symbol: 'pswap', currencyId: 'pswap-on-chain' },
    ];
    store.allNetworks = [{
      name, chainId, ecosystem: 'substrate', assets,
      externalApi: { history: { type: 'soraSubquery', url }, staking: { type: 'sora', url: 'https://staking.example' } },
    }] as unknown as NetworkJson[];
    useAccountsStore().balances = [{ groupId: 'native', balances: [{ name, id: 'native', isUtility: true }] }] as TokenGroup[];
    vi.spyOn(BaseApi, 'formatAddress').mockReturnValue('account');
    const row = { id: 'reward', timestamp: 1710000000, address: 'account', execution: { success: true } };
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: {
      _health: { genesisHash: '0x' + chainId, workerReady: true, latestIndexedAt: Date.now() / 1000 },
      historyElements: { nodes: [
        { ...row, method: 'rewarded' },
        { ...row, id: 'transfer', method: 'transfer', data: { assetId: 'pswap-on-chain' }, execution: { success: false } },
      ] },
    } } });
    await store.fetchHistory({ networkName: name, address: 'account', assetId: 'native' });
    expect(post).toHaveBeenCalledWith(url, expect.objectContaining({ variables: { address: 'account' } }), expect.anything());
    expect(store.history.validator.account['sora mainnet'].nodes[0]).toMatchObject({ id: 'reward', success: true });
    expect(store.history.token.account['sora mainnet'].nodes[0]).toMatchObject({
      id: 'transfer', timestamp: '1710000000', success: false,
    });
  });
});
