import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({
  accounts: null as unknown as { accounts: AccountJson[]; selectedWallet: { address: string } },
  route: null as unknown as { name: string },
  push: vi.fn(),
  replace: vi.fn(),
  environment: { IS_EXTENSION: true },
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/router/routes', () => ({
  Components: { Wallet: 'Wallet', Currencies: 'Currencies', Nfts: 'Nfts', AddWallet: 'AddWallet' },
}));
vi.mock('@/consts/global', () => mocks.environment);

import LegacyWalletUpgradeNotice from '@/screens/main/LegacyWalletUpgradeNotice.vue';
import { WalletEcosystem } from '@/interfaces';

const storageKey = 'fearless:legacy-wallet-upgrade-notice:v2';
const formerStorageKey = 'fearless:legacy-wallet-upgrade-notice:v1';
const legacy = (address = 'legacy-address'): AccountJson => ({ address, name: 'Old wallet', ethereumAddress: '' });
const wrappers: ReturnType<typeof mount>[] = [];
const mountNotice = (locale = 'en-EN') => {
  const wrapper = mount(LegacyWalletUpgradeNotice, {
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale })] },
  });
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => {
  localStorage.clear();
  mocks.environment.IS_EXTENSION = true;
  mocks.accounts = reactive({ accounts: [], selectedWallet: { address: '' } });
  mocks.route = reactive({ name: 'Currencies' });
  mocks.push.mockReset().mockResolvedValue(undefined);
  mocks.replace.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('legacy wallet upgrade popup', () => {
  it('waits for late accounts and shows an accessible modal on the portfolio', async () => {
    const wrapper = mountNotice();
    expect(wrapper.find('dialog').exists()).toBe(false);
    mocks.accounts.accounts = [legacy()];
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');
    expect(wrapper.get('dialog').attributes('aria-labelledby')).toBe(wrapper.get('h1').attributes('id'));
    expect(document.activeElement).toBe(wrapper.get('h1').element);
    expect(wrapper.findAll('li')).toHaveLength(3);
    expect(wrapper.text()).toContain('Nothing moves automatically.');
    expect(wrapper.text()).toContain('same networks');
  });

  it.each(['Unlock', 'SendForm', 'AddWallet', 'MigrationAccounts', 'Settings', 'NftSendForm'])(
    'does not interrupt %s and waits until the portfolio is visible', async (name) => {
      mocks.route.name = name;
      mocks.accounts.accounts = [legacy()];
      const wrapper = mountNotice();
      expect(wrapper.find('dialog').exists()).toBe(false);
      mocks.route.name = 'Currencies';
      await nextTick();
      expect(wrapper.find('dialog').exists()).toBe(true);
      mocks.route.name = 'SendForm';
      await nextTick();
      expect(wrapper.find('dialog').exists()).toBe(false);
      expect(localStorage.getItem(storageKey)).toBeNull();
    }
  );

  it.each(['Wallet', 'Currencies', 'Nfts'])('appears on the %s portfolio root', (name) => {
    mocks.route.name = name;
    mocks.accounts.accounts = [legacy()];
    expect(mountNotice().find('dialog').exists()).toBe(true);
  });

  it('stays quiet outside the browser extension', () => {
    mocks.environment.IS_EXTENSION = false;
    mocks.accounts.accounts = [legacy()];
    expect(mountNotice().find('dialog').exists()).toBe(false);
  });

  it.each(['later', 'close', 'escape'])('%s closes the dialog for good but keeps the recovery banner', async (method) => {
    mocks.accounts.accounts = [legacy('one'), legacy('two')];
    const wrapper = mountNotice();
    if (method === 'escape') await wrapper.get('dialog').trigger('cancel');
    else await wrapper.get(`.wallet-upgrade__${method}`).trigger('click');
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(['one', 'two']);
    expect(wrapper.get('[role="status"]').text()).toContain('recovery-only');
    wrapper.unmount();
    // Opening the extension again shows the banner without the dialog.
    mocks.accounts.accounts.reverse();
    const reopened = mountNotice();
    expect(reopened.find('dialog').exists()).toBe(false);
    expect(reopened.get('[role="status"]').text()).toContain('recovery-only');
    // A key imported later still gets the dialog once.
    mocks.accounts.accounts.push(legacy('newly-imported'));
    await nextTick();
    expect(reopened.find('dialog').exists()).toBe(true);
    await reopened.get('.wallet-upgrade__later').trigger('click');
    expect(mountNotice().find('dialog').exists()).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('cannot be suppressed by the former optional notice acknowledgement', () => {
    localStorage.setItem(formerStorageKey, JSON.stringify(['legacy-address']));
    mocks.accounts.accounts = [legacy()];
    expect(mountNotice().find('dialog').exists()).toBe(true);
  });

  it('keeps normal use available when only newly generated wallets exist', () => {
    mocks.accounts.accounts = [{ ...legacy(), walletSecurityGeneration: 1 }];
    const wrapper = mountNotice();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('shows no warning on a newly created wallet while older wallets remain stored', () => {
    mocks.accounts.accounts = [legacy('old'), { ...legacy('fresh'), walletSecurityGeneration: 1 }];
    mocks.accounts.selectedWallet.address = 'fresh';
    const wrapper = mountNotice();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('warns while an old wallet is viewed and stops on returning to a new wallet', async () => {
    mocks.accounts.accounts = [legacy('old'), { ...legacy('fresh'), walletSecurityGeneration: 1 }];
    mocks.accounts.selectedWallet.address = 'fresh';
    const wrapper = mountNotice();
    mocks.accounts.selectedWallet.address = 'old';
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');
    expect(wrapper.get('[role="status"]').text()).toContain('recovery-only');

    mocks.accounts.selectedWallet.address = 'fresh';
    await nextTick();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('warns about a key imported while a newly created wallet was selected', async () => {
    mocks.accounts.accounts = [{ ...legacy('fresh'), walletSecurityGeneration: 1 }];
    mocks.accounts.selectedWallet.address = 'fresh';
    const wrapper = mountNotice();
    // The import becomes the selected wallet, and its key cannot be proven fresh.
    mocks.accounts.accounts = [...mocks.accounts.accounts, legacy('imported')];
    mocks.accounts.selectedWallet.address = 'imported';
    await nextTick();
    expect(wrapper.find('dialog').exists()).toBe(true);
    expect(wrapper.get('[role="status"]').text()).toContain('recovery-only');
  });

  it('keeps a dismissal for this visit across switches between old and new wallets', async () => {
    mocks.accounts.accounts = [legacy('old'), { ...legacy('fresh'), walletSecurityGeneration: 1 }];
    mocks.accounts.selectedWallet.address = 'old';
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__later').trigger('click');
    mocks.accounts.selectedWallet.address = 'fresh';
    await nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    mocks.accounts.selectedWallet.address = 'old';
    await nextTick();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain('recovery-only');
  });

  it('leaves a normal-use screen when the user switches from a fresh wallet to an old wallet', async () => {
    mocks.accounts.accounts = [legacy('old'), { ...legacy('fresh'), walletSecurityGeneration: 1 }];
    mocks.accounts.selectedWallet.address = 'fresh';
    mocks.route.name = 'Polkaswap';
    mountNotice();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.accounts.selectedWallet.address = 'old';
    await nextTick();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet', query: { security: 'recovery-only' } });
  });

  it('keeps an outgoing transfer open when the selected wallet is recovery-only', async () => {
    mocks.route.name = 'SendForm';
    mountNotice();
    mocks.accounts.accounts = [legacy('old')];
    mocks.accounts.selectedWallet.address = 'old';
    await nextTick();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('can reopen security guidance from the persistent recovery banner', async () => {
    mocks.accounts.accounts = [legacy()];
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__later').trigger('click');
    await wrapper.get('.wallet-recovery-banner button').trigger('click');
    expect(wrapper.find('dialog').exists()).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Wallet' });
    await wrapper.get('.wallet-upgrade__close').trigger('click');
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(mountNotice().find('dialog').exists()).toBe(false);
  });

  it('stays closed when the portfolio is shown again in the same visit', async () => {
    mocks.accounts.accounts = [legacy()];
    const showing = ref(true);
    const Host = defineComponent({
      components: { LegacyWalletUpgradeNotice },
      setup: () => ({ showing }),
      template: '<KeepAlive><LegacyWalletUpgradeNotice v-if="showing" /></KeepAlive>',
    });
    const wrapper = mount(Host, { global: { plugins: [createI18n({ legacy: false, locale: 'en-EN' })] } });
    wrappers.push(wrapper);
    await wrapper.get('.wallet-upgrade__later').trigger('click');
    showing.value = false;
    await nextTick();
    showing.value = true;
    await nextTick();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain('recovery-only');
  });

  it('opens the existing fresh-wallet flow without modifying the old accounts', async () => {
    mocks.accounts.accounts = [legacy()];
    const before = JSON.stringify(mocks.accounts.accounts);
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AddWallet', params: { type: 'create', walletEcosystem: WalletEcosystem.Substrate },
    });
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(JSON.stringify(mocks.accounts.accounts)).toBe(before);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(['legacy-address']);
  });

  it('keeps the recommendation if navigation is cancelled', async () => {
    mocks.accounts.accounts = [legacy()];
    mocks.push.mockResolvedValue(new Error('Navigation cancelled'));
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    await flushPromises();
    expect(wrapper.find('dialog').exists()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('offers a retry after wallet creation cannot be opened', async () => {
    mocks.accounts.accounts = [legacy()];
    mocks.push.mockRejectedValueOnce(new Error('Account creation chunk unavailable'));
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Please try again.');
    expect(wrapper.get('.wallet-upgrade__create').attributes('disabled')).toBeUndefined();
    expect(localStorage.getItem(storageKey)).toBeNull();

    await wrapper.get('.wallet-upgrade__create').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(wrapper.find('dialog').exists()).toBe(false);
  });

  it('guards repeated create clicks while leaving dismissal available during navigation', async () => {
    mocks.accounts.accounts = [legacy()];
    let rejectNavigation!: (error: Error) => void;
    mocks.push.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectNavigation = reject; }));
    const wrapper = mountNotice();
    const create = wrapper.get<HTMLButtonElement>('.wallet-upgrade__create').element;
    // Both clicks happen before Vue renders the disabled state.
    create.click();
    create.click();
    await nextTick();
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(create.disabled).toBe(true);
    expect(create.getAttribute('aria-busy')).toBe('true');
    expect(create.textContent).toBe('Opening…');
    expect(wrapper.get('.wallet-upgrade__close').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('.wallet-upgrade__later').attributes('disabled')).toBeUndefined();

    await wrapper.get('.wallet-upgrade__close').trigger('click');
    rejectNavigation(new Error('Late navigation failure'));
    await flushPromises();
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('ignores a late failure from a previous portfolio visit during a new request', async () => {
    mocks.accounts.accounts = [legacy()];
    let rejectOld!: (error: Error) => void;
    let rejectCurrent!: (error: Error) => void;
    mocks.push
      .mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectOld = reject; }))
      .mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectCurrent = reject; }));
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    mocks.route.name = 'SendForm';
    await nextTick();
    mocks.route.name = 'Currencies';
    await nextTick();
    expect(wrapper.get('.wallet-upgrade__create').attributes('disabled')).toBeUndefined();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    rejectOld(new Error('Previous visit failed'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('.wallet-upgrade__create').attributes('disabled')).toBeDefined();

    rejectCurrent(new Error('Current visit failed'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Please try again.');
    expect(wrapper.get('.wallet-upgrade__create').attributes('disabled')).toBeUndefined();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('ignores a pending navigation failure after unmounting', async () => {
    mocks.accounts.accounts = [legacy()];
    let rejectNavigation!: (error: Error) => void;
    mocks.push.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectNavigation = reject; }));
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    wrapper.unmount();
    rejectNavigation(new Error('Unmounted request failed'));
    await flushPromises();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('translates retry guidance into Russian', async () => {
    mocks.accounts.accounts = [legacy()];
    mocks.push.mockRejectedValueOnce(new Error('Navigation unavailable'));
    const wrapper = mountNotice('ru-RU');
    await wrapper.get('.wallet-upgrade__create').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Попробуйте ещё раз.');
  });

  it.each(['not-json', '{}', '[null, 7]'])('ignores malformed dismissal data %s', (stored) => {
    localStorage.setItem(storageKey, stored);
    mocks.accounts.accounts = [legacy()];
    expect(mountNotice().find('dialog').exists()).toBe(true);
  });

  it('can be dismissed even when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    mocks.accounts.accounts = [legacy()];
    const wrapper = mountNotice();
    await wrapper.get('.wallet-upgrade__later').trigger('click');
    expect(wrapper.find('dialog').exists()).toBe(false);
    mocks.route.name = 'SendForm';
    await nextTick();
    mocks.route.name = 'Wallet';
    await nextTick();
    expect(wrapper.find('dialog').exists()).toBe(false);
  });

  it('closes on KeepAlive deactivation and returns on activation without treating it as dismissal', async () => {
    mocks.accounts.accounts = [legacy()];
    const showing = ref(true);
    const Host = defineComponent({
      components: { LegacyWalletUpgradeNotice },
      setup: () => ({ showing }),
      template: '<KeepAlive><LegacyWalletUpgradeNotice v-if="showing" /></KeepAlive>',
    });
    const wrapper = mount(Host, { global: { plugins: [createI18n({ legacy: false, locale: 'en-EN' })] } });
    wrappers.push(wrapper);
    expect(wrapper.find('dialog').exists()).toBe(true);
    showing.value = false;
    await nextTick();
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    showing.value = true;
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('provides translated Russian guidance and complete English fallback for other locales', () => {
    mocks.accounts.accounts = [legacy()];
    const russian = mountNotice('ru-RU');
    expect(russian.text()).toContain('Переведите средства');
    expect(russian.get('dialog').attributes('lang')).toBe('ru');
    const fallback = mountNotice('egy-Egyp');
    expect(fallback.text()).toContain('Transfer your funds');
    expect(fallback.get('dialog').attributes('lang')).toBe('en');
  });
});
