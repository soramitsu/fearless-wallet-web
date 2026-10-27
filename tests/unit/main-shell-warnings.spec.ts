import { shallowMount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const store = reactive({
  accounts: [] as { address: string; walletSecurityGeneration?: number }[],
  selectedWallet: { address: '', isMnemonicUnverified: false },
  syncSoraDisclaimerStatus: vi.fn(),
});

vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => store }));
// The shell's parts each have their own specs; here they only need to be there, with the props the shell passes.
const { part } = vi.hoisted(() => ({
  part: (name: string, props: string[] = []) => ({ default: { name, props, template: '<div />' } }),
}));
vi.mock('@/screens/main/Header.vue', () => part('Header', ['showSelectWalletPopup', 'highlightSettingsIcon', 'showSettingsButton']));
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

import Main from '@/screens/main/Main.vue';

const wrappers: VueWrapper[] = [];
const mountShell = () => {
  const wrapper = shallowMount(Main, {
    global: { mocks: { $route: { name: 'Currencies', meta: {} }, $t: (key: string) => key }, stubs: { RouterView: true } },
  });
  wrappers.push(wrapper);
  return wrapper;
};
const shows = (wrapper: VueWrapper, name: string) => wrapper.findComponent({ name }).exists();

beforeEach(() => {
  store.accounts = [{ address: 'old' }, { address: 'new', walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION }];
  store.selectedWallet = { address: 'old', isMnemonicUnverified: false };
});

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('the wallet shell', () => {
  it('shows one warning on an old wallet: its recovery banner, without the exposure reminder', async () => {
    const wrapper = mountShell();

    expect(shows(wrapper, 'LegacyWalletUpgradeNotice')).toBe(true);
    expect(shows(wrapper, 'LegacyExposureBanner')).toBe(false);

    // A wallet created in this version has no recovery banner, so the reminder decides for itself again.
    store.selectedWallet = { address: 'new', isMnemonicUnverified: false };
    await nextTick();
    expect(shows(wrapper, 'LegacyExposureBanner')).toBe(true);
  });

  it('leaves Settings to the dock while a wallet is open, and keeps it in the header without one', async () => {
    const wrapper = mountShell();

    expect(shows(wrapper, 'Menu')).toBe(true);
    expect(wrapper.getComponent({ name: 'Header' }).props('showSettingsButton')).toBe(false);

    store.selectedWallet = { address: '', isMnemonicUnverified: false };
    await nextTick();
    expect(shows(wrapper, 'Menu')).toBe(false);
    expect(wrapper.getComponent({ name: 'Header' }).props('showSettingsButton')).toBe(true);
  });
});
