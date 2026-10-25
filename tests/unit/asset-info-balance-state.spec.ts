import { flushPromises, mount } from '@vue/test-utils';
import { APIItemState } from '@extension-base/api/types/networks';
import { TON_ID } from '@/consts/currencies';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ fiatSymbol: '$', selectedNetwork: 'TON Mainnet', selectedWallet: { isTon: true } }),
}));
vi.mock('@/screens/accounts/AccountSettingsPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/BalanceDetailsPopup.vue', () => ({ default: { template: '<div />' } }));

import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';

type Balance = { name: string; state: APIItemState; transferable?: string; total?: string };

// The TON balance item as TonBalance writes it: on TON Mainnet, plus the testnet item of the same asset.
const tonCurrency = (mainnet: Omit<Balance, 'name'>) => ({
  symbol: 'ton',
  icon: 'ton',
  balances: [
    { id: TON_ID, name: 'ton mainnet', ...mainnet },
    { id: TON_ID, name: 'ton testnet', state: APIItemState.READY, transferable: '0', total: '0' },
  ],
});

const mountAssetInfo = async (currency: ReturnType<typeof tonCurrency>) => {
  const wrapper = mount(AssetInfo, {
    props: { currency, price: { price: 5, priceChange: 0 } },
    global: {
      mocks: {
        $t: (key: string) => key,
        $n: (value: number) => String(value),
        $route: { params: { selectedNetwork: 'TON Mainnet' } },
      },
      stubs: {
        Fragment: { template: '<div><slot /></div>' },
        ContentForm: { template: '<div><slot /></div>' },
        ExternalLogo: true,
        Icon: true,
        Shimmer: { template: '<i data-testid="shimmer" />' },
        BalanceDetailsPopup: true,
        AccountSettingsPopup: true,
      },
    },
  });
  // The amount is read when the page mounts.
  await flushPromises();

  return wrapper;
};

describe('the asset page balance', () => {
  it('says the update failed, never "0 TON", when no provider answered and nothing was loaded before', async () => {
    const wrapper = await mountAssetInfo(tonCurrency({ state: APIItemState.ERROR }));

    expect(wrapper.get('[data-testid="assetBalanceUnavailable"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(wrapper.find('[data-testid="assetBalance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="fiatAssetBalance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lockedBalance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="shimmer"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/\b0 TON\b/);
    wrapper.unmount();
  });

  it('shows the last confirmed amount after a failed update, marked as out of date', async () => {
    const wrapper = await mountAssetInfo(tonCurrency({ state: APIItemState.ERROR, transferable: '3.5', total: '3.5' }));

    expect(wrapper.get('[data-testid="assetBalance"]').text()).toBe('3.5 TON');
    expect(wrapper.get('[data-testid="assetBalanceFailed"]').text()).toBe('$ 17.5 · portfolioPage.balanceStatus.failed');
    expect(wrapper.find('[data-testid="assetBalanceUnavailable"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps loading while the first answer is pending, and shows a loaded balance as before', async () => {
    // The testnet item has loaded; that does not make the mainnet amount known.
    const pending = await mountAssetInfo(tonCurrency({ state: APIItemState.PENDING }));
    expect(pending.findAll('[data-testid="shimmer"]').length).toBeGreaterThan(0);
    expect(pending.find('[data-testid="assetBalance"]').exists()).toBe(false);
    expect(pending.find('[data-testid="assetBalanceUnavailable"]').exists()).toBe(false);
    pending.unmount();

    const ready = await mountAssetInfo(tonCurrency({ state: APIItemState.READY, transferable: '2', total: '2' }));
    expect(ready.get('[data-testid="assetBalance"]').text()).toBe('2 TON');
    expect(ready.get('[data-testid="fiatAssetBalance"]').text()).toBe('$ 10');
    expect(ready.find('[data-testid="assetBalanceFailed"]').exists()).toBe(false);
    ready.unmount();
  });
});
