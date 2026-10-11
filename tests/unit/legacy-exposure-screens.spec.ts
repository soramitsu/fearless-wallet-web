import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  status: vi.fn(),
  acknowledge: vi.fn(),
  update: vi.fn(),
  hasMasterPassword: vi.fn(),
  updateCurrentAccount: vi.fn(),
}));
const route = reactive({ name: 'SecurityNotice', fullPath: '/security-notice', query: {} as Record<string, string> });
const store = reactive({
  accounts: [] as { address: string; walletEcosystem?: string }[],
  selectedWallet: { address: '' },
  balances: [] as unknown[],
  networkScanStates: {} as Record<string, unknown>,
  isBalanceLoading: false,
});

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/extension/messaging/legacy-exposure', () => ({
  getLegacyExposureStatus: mocks.status,
  acknowledgeLegacyExposure: mocks.acknowledge,
  updateLegacyExposure: mocks.update,
}));
vi.mock('@/extension/messaging', () => ({
  hasMasterPassword: mocks.hasMasterPassword,
  updateCurrentAccount: mocks.updateCurrentAccount,
}));
vi.mock('@/router/routes', () => ({
  Components: Object.fromEntries(
    ['SecurityNotice', 'SecurityNoticeGuide', 'Welcome', 'Wallet', 'AddWallet', 'ChangePassword', 'SendForm'].map((name) => [
      name,
      name,
    ])
  ),
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    tc: (key: string, count: number) => `${key} #${count}`,
    n: (value: number) => String(value),
  }),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => store }));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    getNetwork: (name: string) => ({
      name: `${name} network`,
      chainId: name,
      options: name === 'Westend' ? ['testnet'] : [],
    }),
  }),
}));

import SecurityNotice from '@/screens/securityNotice/SecurityNotice.vue';
import SecurityNoticeGuide from '@/screens/securityNotice/SecurityNoticeGuide.vue';
import LegacyExposureBanner from '@/components/LegacyExposureBanner.vue';

const FButton = defineComponent({
  props: { text: { type: String, default: '' }, disabled: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit }) {
    return () => h('button', { ...attrs, type: 'button', disabled: props.disabled, onClick: () => emit('click') }, props.text);
  },
});
const Checkbox = defineComponent({
  props: { label: { type: String, default: '' }, value: Boolean },
  emits: ['change'],
  setup(props, { attrs, emit }) {
    return () =>
      h('label', attrs, [
        h('input', { type: 'checkbox', checked: props.value, onChange: () => emit('change', !props.value) }),
        props.label,
      ]);
  },
});
const stubs = {
  AboveForm: { template: '<main><slot /></main>' },
  Icon: true,
  FButton,
  Checkbox,
};

const MAIN = '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH';
const TON = 'UQCG65A1CoCyKH3Xet8GNkEcfyGiZolh2DG2zc8rXRVHSPJ0';
const REMOVED = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const NEW = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const NEW_2 = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
const NEW_TON = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';

const status = (overrides: Partial<LegacyExposureStatus> = {}): LegacyExposureStatus =>
  ({
    state: 'acknowledged',
    wallets: [
      { address: MAIN, walletEcosystem: 'substrate', name: 'Main', present: true },
      { address: TON, walletEcosystem: 'ton', name: 'TON wallet', present: true },
      { address: REMOVED, walletEcosystem: 'substrate', name: 'Old', present: false },
    ],
    newWallets: [],
    ...overrides,
  }) as LegacyExposureStatus;

const click = async (wrapper: ReturnType<typeof mount>, testId: string, index = 0) => {
  await wrapper.findAll(`[data-testid="${testId}"]`)[index].trigger('click');
  await flushPromises();
};

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.clearAllMocks();
  route.query = {};
  route.fullPath = '/security-notice';
  store.accounts = [
    { address: MAIN, walletEcosystem: 'substrate' },
    { address: TON, walletEcosystem: 'ton' },
    { address: NEW, walletEcosystem: 'substrate' },
    { address: NEW_2, walletEcosystem: 'substrate' },
    { address: NEW_TON, walletEcosystem: 'ton' },
  ];
  store.selectedWallet = { address: NEW };
  store.balances = [];
  store.networkScanStates = {};
  store.isBalanceLoading = false;
  mocks.hasMasterPassword.mockResolvedValue(true);
  mocks.updateCurrentAccount.mockResolvedValue(true);
});

describe('the security notice', () => {
  it('says what is known, lists the old wallets, and blocks until the user confirms', async () => {
    mocks.status.mockResolvedValue(status({ state: 'notice_pending' }));
    mocks.acknowledge.mockResolvedValue(status());
    route.query = { redirect: '/transaction' };
    const wrapper = mount(SecurityNotice, { global: { stubs } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('exposureNotice.whatHappened {"first":"3.0.1","from":"3.0.3","to":"3.0.5"}');
    for (const key of ['heading', 'thisVersion', 'whatWeKnow', 'whatItMeans', 'passwordAdvice', 'whatToDo', 'enrollmentHold']) {
      expect(text).toContain(`exposureNotice.${key}`);
    }
    const wallets = wrapper.findAll('[data-testid="securityNoticeWallet"]').map((item) => item.text());
    expect(wallets).toHaveLength(3);
    expect(wallets[2]).toContain('exposureNotice.walletRemoved');
    expect(wallets[2]).toContain('exposureNotice.walletRemovedHint');

    const next = wrapper.find('[data-testid="securityNoticeContinue"]');
    expect(next.attributes('disabled')).toBeDefined();
    await next.trigger('click');
    expect(mocks.acknowledge).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="securityNoticeConfirm"] input').trigger('change');
    expect(next.attributes('disabled')).toBeUndefined();
    await click(wrapper, 'securityNoticeContinue');

    expect(mocks.acknowledge).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
      name: 'SecurityNoticeGuide',
      query: { redirect: '/transaction' },
    });
  });

  it('keeps the user on the notice with a way to try again when the answer is lost', async () => {
    mocks.status.mockResolvedValue(status({ state: 'notice_pending' }));
    mocks.acknowledge.mockRejectedValueOnce(new Error('port closed')).mockResolvedValueOnce(status());
    const wrapper = mount(SecurityNotice, { global: { stubs } });
    await flushPromises();
    await wrapper.find('[data-testid="securityNoticeConfirm"] input').trigger('change');

    await click(wrapper, 'securityNoticeContinue');
    expect(wrapper.find('[data-testid="securityNoticeError"]').exists()).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();

    await click(wrapper, 'securityNoticeContinue');
    expect(wrapper.find('[data-testid="securityNoticeError"]').exists()).toBe(false);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'SecurityNoticeGuide' });
  });

  it('can be read again after it was acknowledged, without asking again', async () => {
    mocks.status.mockResolvedValue(status());
    const wrapper = mount(SecurityNotice, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="securityNoticeConfirm"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('exposureNotice.enrollmentHold');
    await click(wrapper, 'securityNoticeOpenGuide');
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'SecurityNoticeGuide' });
  });
});

describe('the guide to a new wallet', () => {
  const mountGuide = async (value: LegacyExposureStatus) => {
    mocks.status.mockResolvedValue(value);
    mocks.update.mockImplementation(async () => value);
    const wrapper = mount(SecurityNoticeGuide, { global: { stubs } });
    await flushPromises();

    return wrapper;
  };

  it('starts with creating a new wallet, a TON one too when an old TON wallet exists', async () => {
    const wrapper = await mountGuide(status());

    expect(wrapper.find('[data-testid="securityNoticeBackupConfirm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="securityNoticeNoDestination"]').exists()).toBe(true);

    await click(wrapper, 'securityNoticeCreateWallet');
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'AddWallet', params: { type: 'create', walletEcosystem: 'substrate' } });
    await click(wrapper, 'securityNoticeCreateTonWallet');
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'AddWallet', params: { type: 'create', walletEcosystem: 'ton' } });
  });

  it('asks for a password first on a profile that has none', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    const wrapper = await mountGuide(status({ wallets: [{ address: TON, walletEcosystem: 'ton', name: 'TON', present: true }] } as never));

    await click(wrapper, 'securityNoticeCreateTonWallet');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: 'ChangePassword',
      params: { name: 'AddWallet', type: 'create', walletEcosystem: 'ton' },
    });
  });

  it('records the backup and the moved marks the user sets', async () => {
    const wrapper = await mountGuide(
      status({ newWallets: [{ address: NEW, walletEcosystem: 'substrate', name: 'New' }] } as never)
    );
    expect(wrapper.find('[data-testid="securityNoticeNewWallets"]').text()).toContain('New');

    await wrapper.find('[data-testid="securityNoticeBackupConfirm"] input').trigger('change');
    await flushPromises();
    expect(mocks.update).toHaveBeenLastCalledWith({ backupConfirmed: true });

    await click(wrapper, 'securityNoticeMarkMoved', 0);
    expect(mocks.update).toHaveBeenLastCalledWith({ moved: { address: MAIN, moved: true } });
    expect(wrapper.find('[data-testid="securityNoticeProgress"]').text()).toBe('exposureNotice.guide.remaining #2');
  });

  it('opens an old wallet and lists what it still holds, a network coin after its tokens', async () => {
    const value = status({ newWallets: [{ address: NEW, walletEcosystem: 'substrate', name: 'New' }] } as never);
    const wrapper = await mountGuide(value);

    await click(wrapper, 'securityNoticeOpenWallet', 0);
    expect(mocks.updateCurrentAccount).toHaveBeenCalledExactlyOnceWith(MAIN, 'substrate');

    store.selectedWallet = { address: MAIN };
    store.isBalanceLoading = true;
    await flushPromises();
    expect(wrapper.text()).toContain('exposureNotice.guide.checking');

    store.balances = [
      { groupId: 'dot', symbol: 'dot', balances: [{ name: 'Polkadot', total: '2', isUtility: true }, { name: 'Westend', total: '5', isUtility: true }] },
      { groupId: 'usdt', symbol: 'usdt', balances: [{ name: 'Polkadot', total: '10' }, { name: 'Kusama', total: '0' }] },
    ];
    store.isBalanceLoading = false;
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="securityNoticeBalances"] li').map((row) => row.text());
    expect(rows).toEqual([
      '10 USDTPolkadot networkassets.sendButtonText',
      '2 DOTPolkadot networkassets.sendButtonText',
    ]);

    await click(wrapper, 'securityNoticeSend', 1);
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'SendForm',
      params: { assetId: 'dot', network: 'Polkadot' },
      query: { to: NEW },
    });
  });

  it('sends to the new wallet the user picks, and TON to a new TON wallet', async () => {
    const wrapper = await mountGuide(
      status({
        newWallets: [
          { address: NEW, walletEcosystem: 'substrate', name: 'New' },
          { address: NEW_2, walletEcosystem: 'substrate', name: 'Second' },
          { address: NEW_TON, walletEcosystem: 'ton', name: 'New TON' },
        ],
      } as never)
    );
    store.selectedWallet = { address: MAIN };
    store.balances = [{ groupId: 'dot', symbol: 'dot', balances: [{ name: 'Polkadot', total: '2', isUtility: true }] }];
    await flushPromises();

    await click(wrapper, 'securityNoticeDestination', 1);
    await click(wrapper, 'securityNoticeSend');
    expect(mocks.push).toHaveBeenLastCalledWith(expect.objectContaining({ query: { to: NEW_2 } }));

    store.selectedWallet = { address: TON };
    store.balances = [{ groupId: 'ton', symbol: 'ton', balances: [{ name: 'TON Mainnet', total: '3', isUtility: true }] }];
    await flushPromises();
    await click(wrapper, 'securityNoticeSend');
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'SendForm',
      params: { assetId: 'ton', network: 'TON Mainnet' },
      query: { to: NEW_TON },
    });
  });

  it('says so when the open wallet shows no balance, and never lists a removed wallet as openable', async () => {
    const wrapper = await mountGuide(status());
    store.selectedWallet = { address: MAIN };
    // Nothing arrived yet: not loaded, never "nothing left".
    await flushPromises();
    expect(wrapper.find('[data-testid="securityNoticeNothingFound"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="securityNoticeBalanceIssue"]').text()).toBe('portfolioPage.balanceStatus.notLoaded');

    store.balances = [{ groupId: 'dot', symbol: 'dot', balances: [{ name: 'Polkadot', total: '0', state: 'ready', isUtility: true }] }];
    await flushPromises();

    expect(wrapper.find('[data-testid="securityNoticeNothingFound"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="securityNoticeBalanceIssue"]').exists()).toBe(false);

    store.balances = [{ groupId: 'dot', symbol: 'dot', balances: [{ name: 'Polkadot', total: '0', state: 'error', isUtility: true }] }];
    await flushPromises();
    expect(wrapper.find('[data-testid="securityNoticeNothingFound"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="securityNoticeBalanceIssue"]').text()).toBe('portfolioPage.balanceStatus.failed');
    const removed = wrapper.findAll('[data-testid="securityNoticeOldWallet"]')[2];
    expect(removed.text()).toContain('exposureNotice.walletRemovedHint');
    expect(removed.find('[data-testid="securityNoticeOpenWallet"]').exists()).toBe(false);
  });

  it('never reads a list it could not load as "nothing left"', async () => {
    const wrapper = await mountGuide(status());
    store.selectedWallet = { address: MAIN };
    store.balances = [{ groupId: 'dot', symbol: 'dot', balances: [{ name: 'Polkadot', total: '0', state: 'ready' }] }];
    store.networkScanStates = {
      Polkadot: { coverage: 'complete', lastAttempt: Date.now(), stale: true, error: 'network unavailable' },
    };
    await flushPromises();

    expect(wrapper.find('[data-testid="securityNoticeNothingFound"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="securityNoticeBalanceIssue"]').text()).toBe('portfolioPage.balanceStatus.failed');

    // What did load is still listed, with the same caveat.
    store.balances = [{ groupId: 'dot', symbol: 'dot', balances: [{ name: 'Kusama', total: '1', isUtility: true }] }];
    store.networkScanStates = {
      Kusama: { coverage: 'complete', lastAttempt: 1, lastSuccess: 1, stale: true },
    };
    await flushPromises();

    expect(wrapper.findAll('[data-testid="securityNoticeSend"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="securityNoticeBalanceIssue"]').text()).toBe('portfolioPage.balanceStatus.outdated');
  });

  it('leaves for where the user was going, or the wallet', async () => {
    route.query = { redirect: '/transaction' };
    const wrapper = await mountGuide(status());
    await click(wrapper, 'securityNoticeLater');
    expect(mocks.replace).toHaveBeenLastCalledWith('/transaction');

    route.query = {};
    await click(wrapper, 'securityNoticeLater');
    expect(mocks.replace).toHaveBeenLastCalledWith({ name: 'Wallet' });

    await click(wrapper, 'securityNoticeReadNotice');
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'SecurityNotice' });
  });
});

describe('the reminder in the wallet', () => {
  it('counts old wallets still to move and opens the guide', async () => {
    mocks.status.mockResolvedValue(
      status({ wallets: [...status().wallets, { address: NEW_2, walletEcosystem: 'substrate', name: 'Moved', present: true, movedAt: 1 }] } as never)
    );
    const wrapper = mount(LegacyExposureBanner, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('exposureNotice.reminder #2');
    await click(wrapper, 'legacyExposureBannerOpen');
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'SecurityNoticeGuide' });

    await click(wrapper, 'legacyExposureBannerDismiss');
    expect(wrapper.find('[data-testid="legacyExposureBanner"]').exists()).toBe(false);
  });

  it('stays away when there is nothing to tell, and stops asking', async () => {
    mocks.status.mockResolvedValue(status({ state: 'not_exposed', wallets: [] }));
    const wrapper = mount(LegacyExposureBanner, { global: { stubs } });
    await flushPromises();
    route.fullPath = '/fearless/portfolio';
    await flushPromises();

    expect(wrapper.find('[data-testid="legacyExposureBanner"]').exists()).toBe(false);
    expect(mocks.status).toHaveBeenCalledOnce();
  });

  it('stays away while the notice itself is pending or the answer is lost', async () => {
    mocks.status.mockResolvedValueOnce(status({ state: 'notice_pending' })).mockRejectedValueOnce(new Error('lost'));
    const wrapper = mount(LegacyExposureBanner, { global: { stubs } });
    await flushPromises();
    route.fullPath = '/fearless/settings';
    await flushPromises();

    expect(wrapper.find('[data-testid="legacyExposureBanner"]').exists()).toBe(false);
  });
});
