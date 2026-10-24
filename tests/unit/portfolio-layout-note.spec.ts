import { createPinia, setActivePinia } from 'pinia';
import { accountController } from '@/controllers/accountController';
import { parsePortfolioLayoutRecord, shouldShowLayoutNote, walletPredatesLayout } from '@/portfolio/layoutNotice';
import { useAccountsStore } from '@/stores/accounts';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/sora-policy', () => ({ acceptSoraDisclaimer: vi.fn(), getSoraDisclaimerStatus: vi.fn() }));

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const KEY = 'account_portfolio-layout-v1';
let storage: ReturnType<typeof createLocalStorageStub>;

describe('the By token layout record', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('records the first run once and never moves it', () => {
    expect(accountController.recordPortfolioLayoutFirstRun(1000)).toEqual({ firstRunAt: 1000 });
    expect(accountController.recordPortfolioLayoutFirstRun(5000)).toEqual({ firstRunAt: 1000 });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ value: { firstRunAt: 1000 } });
  });

  it('reads without writing, and only the app start writes', () => {
    const store = useAccountsStore();
    expect(store.portfolioLayout.noteDismissed).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();

    store.recordPortfolioLayoutFirstRun();
    expect(storage.setItem).toHaveBeenCalledWith(KEY, expect.any(String));
  });

  it('keeps the dismissal next to the first run', () => {
    const store = useAccountsStore();
    store.recordPortfolioLayoutFirstRun();
    const { firstRunAt } = store.portfolioLayout;

    store.dismissPortfolioLayoutNote();
    expect(JSON.parse(storage.getItem(KEY)!).value).toEqual({ firstRunAt, noteDismissed: true });

    setActivePinia(createPinia());
    expect(useAccountsStore().portfolioLayout).toEqual({ firstRunAt, noteDismissed: true });
  });

  it('reads a corrupt or foreign record as nothing stored', () => {
    storage.setItem(KEY, '{not json');
    expect(accountController.getPortfolioLayout(42)).toEqual({ firstRunAt: 42 });
    expect(parsePortfolioLayoutRecord({ firstRunAt: 'yesterday' })).toBeUndefined();
    expect(parsePortfolioLayoutRecord({ firstRunAt: 7, noteDismissed: 'yes' })).toEqual({ firstRunAt: 7 });
  });
});

describe('who sees the By token note', () => {
  const record = { firstRunAt: 2_000 };

  it('is shown for a wallet the keyring created before this layout first ran', () => {
    expect(walletPredatesLayout({ whenCreated: 1_999 }, record)).toBe(true);
    expect(shouldShowLayoutNote({ whenCreated: 1_999 }, record)).toBe(true);
  });

  it('is not shown for a wallet created on this version, or once closed', () => {
    expect(shouldShowLayoutNote({ whenCreated: 2_000 }, record)).toBe(false);
    expect(shouldShowLayoutNote({ whenCreated: 9_000 }, record)).toBe(false);
    expect(shouldShowLayoutNote({ whenCreated: 1_000 }, { ...record, noteDismissed: true })).toBe(false);
  });

  it('counts a keyring entry without a creation time as older, and waits for the account list', () => {
    expect(shouldShowLayoutNote({}, record)).toBe(true);
    expect(shouldShowLayoutNote({ whenCreated: 'soon' }, record)).toBe(true);
    expect(shouldShowLayoutNote(undefined, record)).toBe(false);
  });
});
