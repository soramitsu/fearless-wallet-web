import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  lockExtension: vi.fn(),
  push: vi.fn(),
  updateAuthorization: vi.fn(),
  route: {
    params: { type: 'substrate', id: 'example.com' } as Record<string, string>,
    query: {} as Record<string, string>,
  },
  accountsStore: {
    accounts: [] as Array<Record<string, unknown>>,
    selectedWallet: {
      address: 'selected-address',
      isTon: false,
    } as Record<string, unknown>,
  },
  extensionStore: {
    authList: {
      'example.com': {
        accountAuthType: 'all',
        authorizedAccounts: ['substrate-address'],
        evmAuthorizedAccount: '0x0000000000000000000000000000000000000001',
        id: 'example.com',
        url: 'https://example.com',
      },
    },
    deleteAuthRequests: vi.fn(),
    getAuthList: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ back: vi.fn(), push: mocks.push }),
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  CONTENT_FORM_HEIGHT: 500,
  IS_EXTENSION: true,
}));
vi.mock('@/extension/messaging', () => ({
  lockExtension: mocks.lockExtension,
  updateAuthorization: mocks.updateAuthorization,
}));
vi.mock('@/router/routes', () => ({
  Components: {
    AccountSetting: 'AccountSetting',
    DAppDetails: 'DAppDetails',
    DAppsAuths: 'DAppsAuths',
    IrohaConnect: 'IrohaConnect',
    SettingsChangePassword: 'SettingsChangePassword',
    SettingsNetworksAssets: 'SettingsNetworksAssets',
    Unlock: 'Unlock',
    WalletConnectInitAuth: 'WalletConnectInitAuth',
  },
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extensionStore }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'settingsPage.irohaConnectDescription': 'SORA 3 wallet sessions for Uranai and Iroha dApps',
        'settingsPage.irohaConnectUnavailable': 'IrohaConnect is not available in this version. Nothing was signed.',
        'settingsPage.tonConnectDescription': 'TonConnect sessions are not supported in this build yet.',
        'settingsPage.buildUnavailable': 'Build unavailable',
        'settingsPage.connectedDappsDescription': 'Substrate and EVM permissions',
        'authorize.unsupportedConnectionManagement':
          'Connection management for this protocol is unavailable in this build.',
      } as Record<string, string>)[key] ?? key,
  }),
}));

import DAppDetails from '@/screens/extension-ui/DAppDetails.vue';
import DAppsAuths from '@/screens/extension-ui/DAppsAuths.vue';
import SettingsPage from '@/screens/settings/SettingsPage.vue';

const mountSettings = () =>
  mount(SettingsPage, {
    global: {
      stubs: {
        ContentForm: { props: ['height'], template: '<main><slot /></main>' },
        Icon: { template: '<span />' },
        Scroll: { template: '<div><slot /></div>' },
      },
    },
  });

const mountAuthList = () =>
  mount(DAppsAuths, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AuthItem: { template: '<article data-testid="authItem" />' },
        Fragment: { template: '<div><slot /></div>' },
      },
    },
  });

const mountAuthDetails = () =>
  mount(DAppDetails, {
    global: {
      stubs: {
        FButton: { template: '<button />' },
        SelectAuthAccountForm: { template: '<div />' },
      },
    },
  });

const originalIrohaConnectFlag = process.env.VUE_APP_ENABLE_IROHA_CONNECT;

describe('settings connection reachability', () => {
  afterEach(() => {
    if (originalIrohaConnectFlag === undefined) delete process.env.VUE_APP_ENABLE_IROHA_CONNECT;
    else process.env.VUE_APP_ENABLE_IROHA_CONNECT = originalIrohaConnectFlag;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VUE_APP_ENABLE_IROHA_CONNECT;
    mocks.route.params = { type: 'substrate', id: 'example.com' };
    mocks.route.query = {};
    mocks.accountsStore.accounts = [];
    mocks.accountsStore.selectedWallet = { address: 'selected-address', isTon: false };
  });

  it('keeps WalletConnect independently actionable', async () => {
    const wrapper = mountSettings();

    await wrapper.get('[data-testid="settings-wallet-connect"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledWith({ name: 'WalletConnectInitAuth', params: undefined });
  });

  it('hides IrohaConnect while the build compiles it off', () => {
    const wrapper = mountSettings();

    expect(wrapper.find('[data-testid="settings-iroha-connect"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-wallet-connect"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-connected-dapps"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="iroha-connect-unavailable"]').exists()).toBe(false);
  });

  it('explains a redirected IrohaConnect link without implying anything was signed', () => {
    mocks.route.query = { notice: 'iroha-connect-unavailable' };
    const wrapper = mountSettings();

    expect(wrapper.get('[data-testid="iroha-connect-unavailable"]').text()).toBe(
      'IrohaConnect is not available in this version. Nothing was signed.'
    );
  });

  it('exposes IrohaConnect as a SORA 3 wallet connection when the reviewed flag enables it', async () => {
    process.env.VUE_APP_ENABLE_IROHA_CONNECT = 'true';
    const wrapper = mountSettings();
    const irohaConnect = wrapper.get('[data-testid="settings-iroha-connect"]');

    expect(irohaConnect.text()).toContain('SORA 3 wallet sessions for Uranai and Iroha dApps');

    await irohaConnect.trigger('click');

    expect(mocks.push).toHaveBeenCalledWith({ name: 'IrohaConnect', params: undefined });
  });

  it('exposes an honest, non-actionable TonConnect state for TON wallets', async () => {
    mocks.accountsStore.selectedWallet = { address: 'ton-address', isTon: true };
    const wrapper = mountSettings();
    const tonConnect = wrapper.get('[data-testid="settings-ton-connect"]');

    expect(tonConnect.attributes('disabled')).toBeDefined();
    expect(tonConnect.text()).toContain('TonConnect sessions are not supported in this build yet.');
    expect(tonConnect.text()).toContain('Build unavailable');

    await tonConnect.trigger('click');

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('detects TON capability on a hybrid wallet without advertising it to unrelated wallets', () => {
    mocks.accountsStore.accounts = [
      {
        address: 'selected-address',
        universalWallet: { publicAccounts: [{ ecosystem: 'ton' }] },
      },
    ];
    const hybrid = mountSettings();

    expect(hybrid.find('[data-testid="settings-ton-connect"]').exists()).toBe(true);

    hybrid.unmount();
    mocks.accountsStore.accounts = [];

    expect(mountSettings().find('[data-testid="settings-ton-connect"]').exists()).toBe(false);
  });

  it('only claims Substrate and EVM permission management from Settings', async () => {
    const wrapper = mountSettings();
    const connectedDapps = wrapper.get('[data-testid="settings-connected-dapps"]');

    expect(connectedDapps.text()).toContain('Substrate and EVM permissions');
    expect(connectedDapps.text()).not.toMatch(/TON|Solana|Iroha/);

    await connectedDapps.trigger('click');

    expect(mocks.push).toHaveBeenCalledWith({ name: 'DAppsAuths', params: { type: 'substrate' } });
  });

  it.each(['ton', 'solana', 'iroha'])('fails closed for the manual %s authorization-list route', async (type) => {
    mocks.route.params = { type, id: 'example.com' };
    const wrapper = mountAuthList();
    await flushPromises();

    expect(wrapper.get('[data-testid="unsupportedConnectionType"]').text()).toContain('unavailable in this build');
    expect(wrapper.find('[data-testid="authItem"]').exists()).toBe(false);
    expect(mocks.extensionStore.getAuthList).not.toHaveBeenCalled();
  });

  it.each(['ton', 'solana', 'iroha'])('fails closed for the manual %s authorization-detail route', async (type) => {
    mocks.route.params = { type, id: 'example.com' };
    const wrapper = mountAuthDetails();
    await flushPromises();

    expect(wrapper.get('[data-testid="unsupportedConnectionDetails"]').text()).toContain('unavailable in this build');
    expect(mocks.updateAuthorization).not.toHaveBeenCalled();
  });

  it('continues to expose existing Substrate authorization management', async () => {
    const wrapper = mountAuthList();
    await flushPromises();

    expect(wrapper.find('[data-testid="unsupportedConnectionType"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="authItem"]').exists()).toBe(true);
    expect(mocks.extensionStore.getAuthList).toHaveBeenCalledOnce();
  });
});
