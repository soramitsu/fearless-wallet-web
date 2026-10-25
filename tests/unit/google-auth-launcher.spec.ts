import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), master: vi.fn(), accounts: [] as Array<Record<string, unknown>> }));
vi.mock('@/extension/messaging', () => ({ initGoogleAuth: mocks.auth, hasMasterPassword: mocks.master, updateCurrentAccount: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: mocks.accounts }) }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: true, IS_PRODUCTION: true }));
vi.mock('@/util/releaseFeatures', () => ({ isGoogleDriveBackupEnabled: () => true }));
vi.mock('@/screens/main/DeleteWalletPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/welcome/ChoiceEcosystem.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/RecoveryDataLink.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', ChangePassword: 'ChangePassword', Welcome: 'Welcome' } }));
import Welcome from '@/screens/welcome/Welcome.vue';
import WalletDetailsPopup from '@/screens/main/WalletDetailsPopup.vue';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = (promise: unknown) => Promise.resolve(promise).catch(() => undefined);
const open = async (kind: 'welcome' | 'wallet', ecosystem = 'substrate') => {
  mocks.accounts = [{ address: 'public-wallet', walletEcosystem: ecosystem, isMobile: false }];
  const wrapper = shallowMount(kind === 'welcome' ? Welcome : WalletDetailsPopup, {
    props: kind === 'wallet' ? { selectedWalletAddress: 'public-wallet', buttonTopClick: 100 } : {},
    global: {
      mocks: { $t: (key: string) => key, $route: { params: {} }, $router: { push: vi.fn() } },
      stubs: { Popup: { template: '<div><slot /></div>' }, FButton: true, Logo: true, CircleButton: true },
    },
  });
  await flushPromises();
  const launch = () => kind === 'welcome'
    ? (wrapper.vm as InstanceType<typeof Welcome>).manageGoogle()
    : (wrapper.vm as InstanceType<typeof WalletDetailsPopup>).exportToGoogleDrive();
  return { wrapper, launch };
};
beforeEach(() => { vi.resetAllMocks(); mocks.master.mockResolvedValue(true); mocks.auth.mockResolvedValue(undefined); });

describe.each(['welcome', 'wallet'] as const)('Google authorization launcher: %s', (kind) => {
  it('admits one flow while authorization is pending', async () => {
    const pending = deferred();
    mocks.auth.mockReturnValue(pending.promise);
    const { wrapper, launch } = await open(kind);
    const first = settle(launch());
    const second = settle(launch());
    expect(mocks.auth).toHaveBeenCalledOnce();
    pending.resolve();
    await Promise.all([first, second]);
    wrapper.unmount();
  });

  it('shows a persistent local failure and permits retry after denied authorization', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('Public fixture cancellation'));
    const { wrapper, launch } = await open(kind);
    await settle(launch());
    await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toBe('addWallet.google.somethingWrong');
    await launch();
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not publish late failure into an abandoned screen', async () => {
    const pending = deferred();
    mocks.auth.mockReturnValue(pending.promise);
    const { wrapper, launch } = await open(kind);
    const result = settle(launch());
    const state = wrapper.vm.$data;
    wrapper.unmount();
    pending.reject(new Error('Public fixture cancellation'));
    await result;
    await flushPromises();
    expect(state.googleAuthError).toBe(false);
  });
});

it('offers encrypted Google export for standalone local Ethereum accounts', async () => {
  const { wrapper } = await open('wallet', 'evm');
  expect(wrapper.find('[data-testid=exportToGoogle]').exists()).toBe(true);
  wrapper.unmount();
});
