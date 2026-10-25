import { createPinia, setActivePinia } from 'pinia';
import type { AccountJson } from '@extension-base/background/types/types';
import {
  defaultPortfolioViewSettings,
  hiddenFundsSignature,
  parsePortfolioViewSettings,
  resolvePortfolioSort,
} from '@/portfolio/portfolioViewSettings';
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

const VIEW_KEY = 'account_portfolio-view-v1';
const wallet = (address: string) => ({ address, ethereumAddress: '', name: address }) as AccountJson;

let storage: ReturnType<typeof createLocalStorageStub>;

describe('portfolio view settings', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to the By token lens with every filter off', () => {
    expect(defaultPortfolioViewSettings()).toEqual({
      lens: 'token',
      hideZero: false,
      showHidden: false,
      showTestnets: false,
      collapsedSections: [],
      expandedGroups: [],
      zeroNetworksExpanded: false,
    });
    expect(parsePortfolioViewSettings(undefined)).toEqual(defaultPortfolioViewSettings());
  });

  it('reads malformed fields as defaults and keeps the valid ones', () => {
    expect(
      parsePortfolioViewSettings({
        lens: 'grid',
        hideZero: 'yes',
        showTestnets: true,
        sort: 'custom',
        collapsedSections: ['a', 3, 'a', 'b'],
        expandedGroups: 'dot',
        hiddenFundsNoticeAck: 42,
      })
    ).toEqual({ ...defaultPortfolioViewSettings(), showTestnets: true, sort: 'custom', collapsedSections: ['a', 'b'] });
  });

  it('keeps the 3.0.5 custom order as the default sort only for wallets that had one', () => {
    expect(resolvePortfolioSort({}, true)).toBe('custom');
    expect(resolvePortfolioSort({}, false)).toBe('value');
    expect(resolvePortfolioSort({ sort: 'value' }, true)).toBe('value');
  });

  it('signs a set of hidden funded assets independently of order and duplicates', () => {
    expect(hiddenFundsSignature(['b', 'a', 'b'])).toBe(hiddenFundsSignature(['a', 'b']));
    expect(hiddenFundsSignature(['a'])).not.toBe(hiddenFundsSignature(['a', 'c']));
  });

  it('opens with defaults on a corrupt stored value and leaves the raw text alone until the user changes a setting', () => {
    storage.setItem(VIEW_KEY, '{not json');
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet(wallet('first'));

    expect(accountsStore.portfolioView).toEqual(defaultPortfolioViewSettings());
    expect(storage.getItem(VIEW_KEY)).toBe('{not json');

    accountsStore.updatePortfolioView({ hideZero: true });
    expect(JSON.parse(storage.getItem(VIEW_KEY)!).value.first.hideZero).toBe(true);
  });

  it('stores settings per wallet and restores them after the popup reopens', () => {
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet(wallet('first'));
    accountsStore.updatePortfolioView({ hideZero: true, collapsedSections: ['substrate:polkadot'] });
    accountsStore.setSelectedWallet(wallet('second'));

    expect(accountsStore.portfolioView).toEqual(defaultPortfolioViewSettings());
    accountsStore.updatePortfolioView({ showTestnets: true });

    setActivePinia(createPinia());
    const reopened = useAccountsStore();
    reopened.setSelectedWallet(wallet('first'));
    expect(reopened.portfolioView).toMatchObject({ hideZero: true, showTestnets: false, collapsedSections: ['substrate:polkadot'] });
    reopened.setSelectedWallet(wallet('second'));
    expect(reopened.portfolioView).toMatchObject({ hideZero: false, showTestnets: true });
    // Asset preferences are a separate key; view settings never write one.
    expect(storage.getItem('account_asset-preferences-v1')).toBeNull();
  });

  it('keeps working in memory when storage refuses the write', () => {
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet(wallet('first'));
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => accountsStore.updatePortfolioView({ hideZero: true })).not.toThrow();
    expect(accountsStore.portfolioView.hideZero).toBe(true);
  });
});
