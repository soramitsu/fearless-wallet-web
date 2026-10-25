import { createPinia, setActivePinia } from 'pinia';
import type { ResponsePortfolioHoldings } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({ getPortfolioHoldings: vi.fn(), stored: new Map<string, string>(), writes: 0 }));

vi.mock('@/extension/messaging', () => ({ getPortfolioHoldings: mocks.getPortfolioHoldings }));
// localStorage in memory: what the store remembers is what a later popup would read.
vi.mock('@/controllers/localStorageController', () => ({
  LocalStorage: class {
    constructor(private prefix: string) {}
    get(key: string) {
      const item = mocks.stored.get(`${this.prefix}${key}`);

      return item ? JSON.parse(item) : {};
    }
    set(key: string, value: unknown) {
      mocks.writes += 1;
      mocks.stored.set(`${this.prefix}${key}`, JSON.stringify({ value }));
    }
  },
}));

import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';

const answer = (address: string, total: string): ResponsePortfolioHoldings => ({
  address,
  total,
  changeAmount: '0',
  changePercent: '0',
  hiddenCount: 0,
  unpricedCount: 0,
  unavailableCount: 0,
  poolStakesExcluded: false,
  holdings: [],
  staleNetworks: [],
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};
const freshStore = () => {
  setActivePinia(createPinia());

  return usePortfolioDashboardStore();
};

beforeEach(() => {
  mocks.stored.clear();
  mocks.writes = 0;
  mocks.getPortfolioHoldings.mockReset();
});

describe('portfolio dashboard store: preferences', () => {
  it('starts as All wallets by tokens', () => {
    expect(freshStore().preferences).toEqual({ scope: 'all', lens: 'token', slots: {} });
  });

  it('remembers the scope, lens and colours for the next visit', () => {
    const store = freshStore();

    store.setScope('wallet');
    store.setLens('network');
    store.setSlots('all:token', { a: 1, b: 2 });

    expect(freshStore().preferences).toEqual({ scope: 'wallet', lens: 'network', slots: { 'all:token': { a: 1, b: 2 } } });
  });

  it('writes nothing when nothing changed', () => {
    const store = freshStore();

    store.setScope('all');
    store.setLens('token');
    store.setSlots('all:token', { a: 1 });
    const writes = mocks.writes;
    store.setScope('all');
    store.setLens('token');
    store.setSlots('all:token', { a: 1 });

    expect(mocks.writes).toBe(writes);
  });

  it('starts from the defaults when what was stored is not usable', () => {
    mocks.stored.set('portfolio_dashboard-v1', '{"value":{"scope":"everywhere","lens":7,"slots":null}}');

    expect(freshStore().preferences).toEqual({ scope: 'all', lens: 'token', slots: {} });
  });
});

describe('portfolio dashboard store: reading every wallet', () => {
  it('keeps the answer and when it arrived', async () => {
    const store = freshStore();
    mocks.getPortfolioHoldings.mockResolvedValue([answer('a', '10'), answer('b', '5')]);

    await store.refresh();

    expect(store.status).toBe('ready');
    expect(store.holdings.map(({ address }) => address)).toEqual(['a', 'b']);
    expect(store.readAt).toBeGreaterThan(0);
  });

  it('sends the hidden keys it is given, and nothing at all when there are none', async () => {
    const store = freshStore();
    mocks.getPortfolioHoldings.mockResolvedValue([]);

    await store.refresh({ a: ['key'] });
    await store.refresh();

    expect(mocks.getPortfolioHoldings.mock.calls).toEqual([[{ hiddenKeysByAddress: { a: ['key'] } }], [null]]);
  });

  it('keeps the last answer when a read fails, and says so', async () => {
    const store = freshStore();
    mocks.getPortfolioHoldings.mockResolvedValueOnce([answer('a', '10')]).mockRejectedValueOnce(new Error('port closed'));

    await store.refresh();
    const readAt = store.readAt;
    await store.refresh();

    expect(store.status).toBe('error');
    expect(store.holdings.map(({ total }) => total)).toEqual(['10']);
    expect(store.readAt).toBe(readAt);
  });

  it('treats an answer that is not a list as a failed read', async () => {
    const store = freshStore();
    mocks.getPortfolioHoldings.mockResolvedValueOnce([answer('a', '10')]).mockResolvedValueOnce({ unexpected: true });

    await store.refresh();
    await store.refresh();

    expect(store.status).toBe('error');
    expect(store.holdings.map(({ total }) => total)).toEqual(['10']);
  });

  it('lets only the newest read set the answer, whatever order they arrive in', async () => {
    const store = freshStore();
    const older = deferred<ResponsePortfolioHoldings[]>();
    const newer = deferred<ResponsePortfolioHoldings[]>();
    mocks.getPortfolioHoldings.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const first = store.refresh();
    const second = store.refresh();
    newer.resolve([answer('a', 'newer')]);
    await second;
    older.resolve([answer('a', 'older')]);
    await first;

    expect(store.holdings[0].total).toBe('newer');
    expect(store.status).toBe('ready');
  });

  it('does not let a slow failure of an older read spoil a newer answer', async () => {
    const store = freshStore();
    const older = deferred<ResponsePortfolioHoldings[]>();
    mocks.getPortfolioHoldings.mockReturnValueOnce(older.promise).mockResolvedValueOnce([answer('a', '7')]);

    const first = store.refresh();
    await store.refresh();
    older.reject(new Error('late'));
    await first;

    expect(store.status).toBe('ready');
    expect(store.holdings[0].total).toBe('7');
  });
});
