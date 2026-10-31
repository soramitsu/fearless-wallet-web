import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletEcosystem } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';

// The shell's own parts have their own specs; here they only need to be there.
const { part } = vi.hoisted(() => ({ part: (name: string) => ({ default: { name, template: '<div />' } }) }));
vi.mock('@/screens/main/Header.vue', () => part('Header'));
vi.mock('@/screens/main/Menu.vue', () => part('Menu'));
vi.mock('@/screens/main/SelectWalletPopup.vue', () => part('SelectWalletPopup'));
vi.mock('@/screens/main/WalletDetailsPopup.vue', () => part('WalletDetailsPopup'));
vi.mock('@/screens/main/FiatsPopup.vue', () => part('FiatsPopup'));
vi.mock('@/screens/main/AboutPopup.vue', () => part('AboutPopup'));
vi.mock('@/screens/main/LanguagePopup.vue', () => part('LanguagePopup'));
vi.mock('@/screens/main/LegacyWalletUpgradeNotice.vue', () => part('LegacyWalletUpgradeNotice'));
vi.mock('@/screens/extension-ui/ManageAuths.vue', () => part('ManageAuths'));
vi.mock('@/components/AccountAccessBanner.vue', () => part('AccountAccessBanner'));
vi.mock('@/components/LegacyExposureBanner.vue', () => part('LegacyExposureBanner'));
// The real wallet home, with its toolbar and popups left out.
vi.mock('@/screens/wallet&asset/wallet/WalletSettings.vue', () => part('WalletSettings'));
vi.mock('@/screens/wallet&asset/SendForm.vue', () => part('SendFormPart'));
vi.mock('@/screens/wallet&asset/ReceiveForm.vue', () => part('ReceiveFormPart'));
vi.mock('@/screens/wallet&asset/wallet/NetworkManagement.vue', () => part('NetworkManagement'));
vi.mock('@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue', () => part('NetworkUnavailablePopup'));
vi.mock('@/screens/wallet&asset/wallet/GoogleExportPopup.vue', () => part('GoogleExportPopup'));
vi.mock('@/screens/main/WalletBalance.vue', () => part('WalletBalance'));
vi.mock('@/portfolio/usePortfolio', () => ({
  usePortfolio: () => ({
    summary: { total: '0', hiddenAssetCount: 0, hiddenTestnetAssetCount: 0, unavailableCount: 0, changePercent: 0, changeAmount: '0' },
    filteredTotal: null, loadStatus: { state: 'settled', pendingCount: 0 }, legacyOrderIndex: new Map(), summaryInput: {}, hiddenKeys: [],
  }),
}));
vi.mock('@/extension/messaging', () => ({ fetchEvmBalance: vi.fn(), sendMessage: vi.fn(), getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/sora-policy', () => ({ getSoraDisclaimerStatus: async () => ({ accepted: true }), acceptSoraDisclaimer: vi.fn() }));

import Main from '@/screens/main/Main.vue';
import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';

const A = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const B = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const select = (address: string, name: string) =>
  useAccountsStore().setSelectedWallet({ address, name, ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate } as never);

let mounts: string[] = [];
let ids = 0;
// Route screens stand in for the real ones under their real component names, which is what Main.vue keeps alive by.
const screen = (name: string, template = `<div class="${name}" />`, extra: Record<string, unknown> = {}) => defineComponent({
  name,
  data: () => ({ id: ++ids, recipient: '', amount: '', note: '' }),
  mounted() { mounts.push(name); },
  template,
  ...extra,
});
const Currencies = screen('Currencies', '<div class="currencies"><input class="note" v-model="note" /></div>');
const Nfts = screen('NftCollectionList');
// Asset.vue hands its page the asset; the history reads the asset's providers.
const Asset = screen('Asset', '<div class="asset"><router-view :currency="{ providers: [] }" /></div>');
const AssetNetworks = screen('AssetNetworks', '<div class="asset-networks" />', { props: ['currency'] });
const AssetHistory = screen('AssetHistory', '<div class="asset-history">{{ currency.providers.length }}</div>', { props: ['currency'] });
const SendForm = screen('SendForm', '<form class="send"><input class="recipient" v-model="recipient" /><input class="amount" v-model="amount" /></form>');
const SwapForm = screen('SwapForm', '<form class="swap"><input class="amount" v-model="amount" /></form>');
const PolkaswapDisclaimer = screen('PolkaswapDisclaimer');
const SettingsPage = screen('SettingsPage');

async function openShell(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/fearless', component: Main, children: [
        { path: 'portfolio', name: 'Wallet', component: Wallet, redirect: { name: 'Currencies' }, children: [
          { path: 'tokens', name: 'Currencies', component: Currencies },
          { path: 'nfts', name: 'Nfts', component: Nfts },
        ] },
        { path: 'portfolio/send/:assetId/:network', name: 'SendForm', component: SendForm },
        { path: 'asset/:assetId', component: Asset, children: [
          { path: '', name: 'AssetNetworks', component: AssetNetworks },
          { path: ':selectedNetwork', name: 'AssetHistory', component: AssetHistory },
        ] },
        { path: 'polkaswap', name: 'Polkaswap', component: SwapForm },
        { path: 'polkaswap/disclaimer', name: 'PolkaswapDisclaimer', component: PolkaswapDisclaimer },
        { path: 'settings', name: 'Settings', component: SettingsPage },
      ],
    }],
  });
  await router.push(path);
  const errors: unknown[] = [];
  const wrapper = mount({ template: '<router-view />' }, {
    attachTo: document.body,
    global: {
      plugins: [router],
      config: { errorHandler: (error) => { errors.push(error); } },
      mocks: { $t: (key: string) => key },
      stubs: { ContentForm: { template: '<div><slot /></div>' }, Loading: true, Tooltip: true, PortfolioDashboard: true },
    },
  });
  await flushPromises();
  const go = async (to: string) => { mounts = []; await router.push(to); await flushPromises(); };
  // KeepAlive keeps hidden screens out of the document.
  const input = (selector: string) => document.querySelector<HTMLInputElement>(selector)!;
  return { wrapper, errors, go, input };
}

describe('screens Main.vue keeps alive', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() });
    setActivePinia(createPinia());
    select(A, 'Wallet A');
    mounts = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts each opened list once, and none inside a hidden screen', async () => {
    const shell = await openShell('/fearless/portfolio/tokens');
    expect(mounts).toEqual(['Currencies']);

    // A child is mounted before its parent.
    await shell.go('/fearless/asset/dot');
    expect(mounts).toEqual(['AssetNetworks', 'Asset']);

    await shell.go('/fearless/asset/dot/polkadot');
    expect(mounts).toEqual(['AssetHistory', 'Asset']);

    // The kept home shows its own list again; the asset pages are gone.
    await shell.go('/fearless/portfolio/tokens');
    expect(mounts).toEqual([]);
    expect(document.querySelectorAll('.currencies')).toHaveLength(1);

    await shell.go('/fearless/portfolio/nfts');
    expect(mounts).toEqual(['NftCollectionList']);

    await shell.go('/fearless/settings');
    await shell.go('/fearless/portfolio/tokens');
    expect(mounts).toEqual([]);
    expect(shell.errors).toEqual([]);
    shell.wrapper.unmount();
  });

  it('opens a send form empty after another wallet was selected', async () => {
    const shell = await openShell('/fearless/portfolio/send/dot/polkadot');
    await shell.wrapper.get('input.recipient').setValue('5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy');
    await shell.wrapper.get('input.amount').setValue('12');

    await shell.go('/fearless/portfolio/tokens');
    select(B, 'Wallet B');
    await shell.go('/fearless/portfolio/send/dot/polkadot');

    expect(mounts).toEqual(['SendForm']);
    expect(shell.input('input.recipient').value).toBe('');
    expect(shell.input('input.amount').value).toBe('');
    shell.wrapper.unmount();
  });

  it('keeps the wallet home and its list as they were', async () => {
    const shell = await openShell('/fearless/portfolio/tokens');
    const home = () => (shell.wrapper.findComponent(Wallet).vm as unknown as { refreshSlotId: string }).refreshSlotId;
    const before = home();
    await shell.wrapper.get('input.note').setValue('kept');

    await shell.go('/fearless/settings');
    await shell.go('/fearless/portfolio/tokens');

    expect(mounts).toEqual([]);
    expect(home()).toBe(before);
    expect(shell.input('input.note').value).toBe('kept');
    shell.wrapper.unmount();
  });

  it('keeps the swap form across its disclaimer', async () => {
    const shell = await openShell('/fearless/polkaswap');
    await shell.wrapper.get('input.amount').setValue('5');

    await shell.go('/fearless/polkaswap/disclaimer');
    await shell.go('/fearless/polkaswap');

    expect(mounts).toEqual([]);
    expect(shell.input('input.amount').value).toBe('5');
    shell.wrapper.unmount();
  });
});
