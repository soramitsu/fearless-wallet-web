import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { SECOND_SUBSTRATE_ADDRESS, SUBSTRATE_ADDRESS, networkMap305, readLegacy305Fixture, readSnapshot } from '../fixtures/legacy-305/generate';
import type { AccountJson } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

const mocks = vi.hoisted(() => ({ getTotalBalances: vi.fn() }));

vi.mock('@/extension/messaging', () => ({
  getTotalBalances: mocks.getTotalBalances,
  getHistory: vi.fn(),
  sendMessage: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));

import WalletInfo from '@/screens/main/WalletInfo.vue';

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

const networks = Object.values(networkMap305(readSnapshot())).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
const keyOf = (networkName: string, symbol: string) => {
  const network = networks.find(({ name }) => name === networkName)!;
  const asset = network.assets.find((candidate) => candidate.symbol === symbol)!;
  return createAssetKey({ ecosystem: String(network.ecosystem), chainId: network.chainId, assetId: String(asset.currencyId ?? asset.id) });
};

const mountWalletInfo = (address: string) =>
  mount(WalletInfo, {
    props: { name: 'Wallet', address },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Icon: true, FCorners: { template: '<div><slot /></div>' } },
    },
  });

describe('wallet list balance', () => {
  beforeEach(() => {
    const storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    Object.entries(readLegacy305Fixture('switches').localStorage).forEach(([key, value]) => storage.setItem(key, value));
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = networks;
    mocks.getTotalBalances.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the wallet hidden keys, 3.0.5 group hides included, and labels a total that includes hidden funds', async () => {
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet({ address: SUBSTRATE_ADDRESS, ethereumAddress: '', name: 'Wallet' } as AccountJson);
    accountsStore.setAssetPreferences({ entries: [{ key: keyOf('Polkadot', 'dot'), preference: 'hidden' }, { key: keyOf('Kusama', 'ksm'), preference: 'auto' }] });
    mocks.getTotalBalances.mockResolvedValue([
      { address: SUBSTRATE_ADDRESS, total: '1234.5', change: { amount: '0', percent: '0' }, hiddenValue: '200', hiddenCount: 2 },
    ]);

    const wrapper = mountWalletInfo(SUBSTRATE_ADDRESS);
    await flushPromises();

    const [[request]] = mocks.getTotalBalances.mock.calls;
    const sent: string[] = request.hiddenKeysByAddress[SUBSTRATE_ADDRESS];
    expect(sent).toContain(keyOf('Polkadot', 'dot'));
    expect(sent).toContain(keyOf('Kusama AssetHub', 'ksm'));
    expect(sent).toContain(keyOf('Ethereum', 'usdt'));
    // An explicit Auto lifts the 3.0.5 hide for that one asset.
    expect(sent).not.toContain(keyOf('Kusama', 'ksm'));
    expect(wrapper.get('[data-testid="fiatBalance"]').text()).toContain('1,234.50');
    expect(wrapper.get('[data-testid="balanceCaption"]').text()).toBe('portfolioPage.inclHidden');
    wrapper.unmount();
  });

  it('shows no label when nothing hidden holds value, and asks without hidden keys when there are none', async () => {
    mocks.getTotalBalances.mockResolvedValue([
      { address: 'fresh', total: '5', change: { amount: '0', percent: '0' }, hiddenValue: '0', hiddenCount: 0 },
    ]);

    const wrapper = mountWalletInfo('fresh');
    await flushPromises();

    expect(mocks.getTotalBalances).toHaveBeenCalledWith(null);
    expect(wrapper.find('[data-testid="balanceCaption"]').exists()).toBe(false);
    wrapper.unmount();

    // The second 3.0.5 wallet hid the DOT group.
    mocks.getTotalBalances.mockResolvedValue([]);
    mountWalletInfo(SECOND_SUBSTRATE_ADDRESS).unmount();
    await flushPromises();
    expect(mocks.getTotalBalances.mock.calls.at(-1)?.[0].hiddenKeysByAddress[SECOND_SUBSTRATE_ADDRESS]).toContain(keyOf('Polkadot', 'dot'));
  });
});
