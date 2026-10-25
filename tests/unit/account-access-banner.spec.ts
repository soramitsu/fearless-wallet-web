import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAccessStatus: vi.fn(), push: vi.fn(), route: undefined as unknown as { name: string; fullPath: string } }));
vi.mock('@/extension/messaging', () => ({ getAccessStatus: mocks.getAccessStatus }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));

import AccountAccessBanner from '@/components/AccountAccessBanner.vue';

const status = (issues: number, scanComplete = true) => ({
  hasMasterPassword: true,
  mustCreateMasterPassword: false,
  promptPending: false,
  deferred: true,
  issues: Array.from({ length: issues }, (_, index) => ({ address: `account-${index}` })),
  scanComplete,
});

async function open(): Promise<VueWrapper> {
  const wrapper = mount(AccountAccessBanner, { global: { stubs: { Icon: { template: '<span />' } } } });
  await flushPromises();
  return wrapper;
}

const banner = (wrapper: VueWrapper) => wrapper.find('[data-testid="accountAccessBanner"]');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route = reactive({ name: 'Wallet', fullPath: '/wallet' });
  mocks.getAccessStatus.mockResolvedValue(status(0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Account access reminder', () => {
  it('is not shown while every account opens with the master password', async () => {
    const wrapper = await open();

    expect(banner(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('says how many accounts wait for a password and opens Account access', async () => {
    mocks.getAccessStatus.mockResolvedValue(status(2));
    const wrapper = await open();

    expect(banner(wrapper).text()).toContain('accountAccess.settingsDescription:2');
    await wrapper.get('[data-testid="accountAccessBannerOpen"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'AccountAccessRecovery' });
    wrapper.unmount();
  });

  it('can be dismissed and then stays away while the wallet is open', async () => {
    mocks.getAccessStatus.mockResolvedValue(status(1));
    const wrapper = await open();

    await wrapper.get('[data-testid="accountAccessBannerDismiss"]').trigger('click');
    expect(banner(wrapper).exists()).toBe(false);

    mocks.route.fullPath = '/settings';
    await flushPromises();

    expect(banner(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('counts again after a navigation, so an unlocked account leaves the reminder', async () => {
    mocks.getAccessStatus.mockResolvedValue(status(1));
    const wrapper = await open();
    expect(banner(wrapper).exists()).toBe(true);

    mocks.getAccessStatus.mockResolvedValue(status(0));
    mocks.route.name = 'Settings';
    mocks.route.fullPath = '/settings';
    await flushPromises();

    expect(banner(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('steps aside on the Account access screen itself', async () => {
    mocks.getAccessStatus.mockResolvedValue(status(1));
    mocks.route = reactive({ name: 'AccountAccessRecovery', fullPath: '/settings/account-access' });
    const wrapper = await open();

    expect(banner(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  // TON phrases are checked in the background after unlock; an account found there must still be announced.
  it('asks again until the check of TON phrases after unlock has finished', async () => {
    vi.useFakeTimers();
    mocks.getAccessStatus.mockResolvedValueOnce(status(0, false)).mockResolvedValue(status(1));
    const wrapper = mount(AccountAccessBanner, { global: { stubs: { Icon: { template: '<span />' } } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(banner(wrapper).exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);

    expect(mocks.getAccessStatus).toHaveBeenCalledTimes(2);
    expect(banner(wrapper).text()).toContain('accountAccess.settingsDescription:1');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.getAccessStatus).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('stops asking after a few attempts when the check never finishes', async () => {
    vi.useFakeTimers();
    mocks.getAccessStatus.mockResolvedValue(status(0, false));
    const wrapper = mount(AccountAccessBanner, { global: { stubs: { Icon: { template: '<span />' } } } });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.getAccessStatus).toHaveBeenCalledTimes(5);
    wrapper.unmount();
  });

  it('keeps what it showed when the status cannot be read', async () => {
    mocks.getAccessStatus.mockResolvedValue(status(1));
    const wrapper = await open();

    mocks.getAccessStatus.mockRejectedValue(new Error('Could not establish connection'));
    mocks.route.fullPath = '/defi';
    await flushPromises();

    expect(banner(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });
});
