import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountSetting from '@/screens/accounts/AccountSetting.vue';
import Accounts from '@/screens/accounts/Accounts.vue';
import AccountSettingsPopup from '@/screens/accounts/AccountSettingsPopup.vue';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { WalletEcosystem } from '@/interfaces';
import { setClipboard } from '@/helpers';
import { getIrohaChainAccounts } from '@/helpers/accounts';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), accountUpdateName: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: { ChainAccounts: 'ChainAccounts', Wallet: 'Wallet' } }));
vi.mock('@/helpers', async (importOriginal) => ({ ...await importOriginal<object>(), setClipboard: vi.fn() }));

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const taira = deriveIrohaAddress({ mnemonic, network: 'taira' });
const nexus = deriveIrohaAddress({ mnemonic, network: 'nexus' });
const globalOptions = {
  mocks: { $t: (key: string) => key, $route: { params: { type: 'iroha' } }, $router: { push: vi.fn() } },
  stubs: {
    FInput: true,
    Icon: true,
    Popup: { template: '<div><slot /></div>' },
    InfoRow: { props: ['text', 'value'], template: '<button @click="$emit(\'click\')">{{ text }} {{ value }}</button>' },
  },
};

describe('offline Nexus account access', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network unavailable'); }));
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = createUniversalWalletRegistryNetworks();
    useAccountsStore().selectedWallet = {
      address: taira.address, irohaAddress: taira.address, irohaPublicKeyHex: taira.publicKeyHex,
      ethereumAddress: '', name: 'New wallet', isTon: false, isSubstrate: false, hasEthereum: false,
      walletEcosystem: WalletEcosystem.Iroha,
    };
    vi.mocked(setClipboard).mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('exposes a newly derived Nexus address through account settings and copies it without network access', async () => {
    const settings = shallowMount(AccountSetting, { global: globalOptions });
    expect(settings.text()).toContain('Iroha accounts.chainAccounts 2');
    const row = settings.findAll('button').find((button) => button.text().startsWith('Iroha'))!;
    await row.trigger('click');
    expect(globalOptions.mocks.$router.push).toHaveBeenCalledWith({ name: 'ChainAccounts', params: { type: 'iroha' } });

    const accounts = shallowMount(Accounts, { global: globalOptions });
    const nexusRow = accounts.findAllComponents({ name: 'AccountsItem' }).find((item) => item.props('network') === 'SORA Nexus');
    expect(nexusRow?.props('address')).toBe(nexus.address);
    expect(nexus.address).not.toBe(taira.address);

    const popup = shallowMount(AccountSettingsPopup, {
      props: { selectedNetwork: 'SORA Nexus', showCopyAddress: true, showNodeSwitch: true, showExport: true },
      global: globalOptions,
    });
    await popup.get('[data-testid="copyAddress"]').trigger('click');
    expect(setClipboard).toHaveBeenCalledWith(nexus.address);
    expect(popup.find('[data-testid="switchNode"]').exists()).toBe(false);
    expect(popup.find('[data-testid="exportAccount"]').exists()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(useNetworksStore().getNetwork(UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId)).toMatchObject({ active: false, disabled: true });
    expect(useNetworksStore().getNetwork(UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId)).toMatchObject({ active: true, disabled: false });
    settings.unmount();
    accounts.unmount();
    popup.unmount();
  });

  it.each([true, false])('keeps Nexus copy-only despite injected node/explorer metadata and disabled=%s', async (disabled) => {
    const network = useNetworksStore().getNetwork(UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId);
    network.disabled = disabled;
    network.active = true;
    network.externalApi!.explorers = [{ type: 'subscan', types: ['account'], url: 'https://injected.example.org' }];
    const popup = shallowMount(AccountSettingsPopup, {
      props: { selectedNetwork: network.name, showCopyAddress: true, showNodeSwitch: true, showExport: true },
      global: globalOptions,
    });

    expect(popup.find('[data-testid="switchNode"]').exists()).toBe(false);
    expect(popup.find('[data-testid="exportAccount"]').exists()).toBe(false);
    expect(popup.find('[data-testid="viewIn"]').exists()).toBe(false);
    await popup.get('[data-testid="copyAddress"]').trigger('click');
    expect(setClipboard).toHaveBeenCalledWith(nexus.address);
    expect(fetch).not.toHaveBeenCalled();
    popup.unmount();
  });

  it('preserves Taira account actions while Nexus remains unavailable', () => {
    const network = useNetworksStore().getNetwork(UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId);
    network.externalApi!.explorers = [{ type: 'subscan', types: ['account'], url: 'https://taira-explorer.example.org' }];
    const popup = shallowMount(AccountSettingsPopup, {
      props: { selectedNetwork: network.name, showCopyAddress: true, showNodeSwitch: true, showExport: true },
      global: globalOptions,
    });

    expect(popup.find('[data-testid="copyAddress"]').exists()).toBe(true);
    expect(popup.find('[data-testid="switchNode"]').exists()).toBe(true);
    expect(popup.find('[data-testid="exportAccount"]').exists()).toBe(true);
    expect(popup.find('[data-testid="viewIn"]').exists()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    popup.unmount();
  });

  it('does not present a generic wallet address as a Nexus address without Iroha key material', () => {
    const wallet = useAccountsStore().selectedWallet;
    wallet.irohaPublicKeyHex = undefined;
    expect(getIrohaChainAccounts(useNetworksStore().allNetworks, wallet).map(({ network }) => network)).toEqual(['Taira Testnet']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('also exposes Nexus in the settings of a universal wallet', () => {
    const wallet = useAccountsStore().selectedWallet;
    wallet.walletEcosystem = WalletEcosystem.Substrate;
    wallet.isSubstrate = true;
    wallet.address = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
    const settings = shallowMount(AccountSetting, { global: globalOptions });
    expect(settings.text()).toContain('Iroha accounts.chainAccounts 2');
    expect(getIrohaChainAccounts(useNetworksStore().allNetworks, wallet)).toContainEqual(
      expect.objectContaining({ network: 'SORA Nexus', address: nexus.address })
    );
    expect(fetch).not.toHaveBeenCalled();
    settings.unmount();
  });
});
