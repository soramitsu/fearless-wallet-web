import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  forgetAccount: vi.fn(),
  validatePassword: vi.fn(),
  updateCurrentAccount: vi.fn(),
  getTotalBalances: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/extension/messaging', () => ({
  forgetAccount: mocks.forgetAccount,
  validatePassword: mocks.validatePassword,
  updateCurrentAccount: mocks.updateCurrentAccount,
  getTotalBalances: mocks.getTotalBalances,
  initGoogleAuth: vi.fn(),
  getHistory: vi.fn(),
  sendMessage: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome', Export: 'Export', AccountSetting: 'AccountSetting' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

import WalletDetailsPopup from '@/screens/main/WalletDetailsPopup.vue';
import { useAccountsStore } from '@/stores/accounts';

const SUBSTRATE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const TON = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
const MOBILE = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';

const accounts = [
  { address: SUBSTRATE, name: 'Savings', walletEcosystem: WalletEcosystem.Substrate, isMobile: false, ethereumAddress: '' },
  { address: TON, name: 'TON wallet', walletEcosystem: WalletEcosystem.Ton, isMobile: false, ethereumAddress: '' },
  { address: MOBILE, name: 'From the phone', walletEcosystem: WalletEcosystem.Substrate, isMobile: true, ethereumAddress: '' },
] as AccountJson[];

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

async function openMenu(address: string): Promise<VueWrapper> {
  const wrapper = mount(WalletDetailsPopup, {
    props: { selectedWalletAddress: address, buttonTopClick: 100 },
    global: {
      mocks: { $t: (key: string) => key, $router: { push: mocks.push } },
      stubs: {
        Popup: { emits: ['handlerClose'], template: '<div class="popup"><slot /></div>' },
        Icon: true,
        Shimmer: { template: '<i data-testid="shimmer" />' },
        FButton: {
          props: ['text', 'disabled'],
          emits: ['click'],
          template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
        },
        ValidatedInput: {
          props: ['value', 'isError', 'errorDescriptions', 'placeholder'],
          emits: ['change', 'pressEnter'],
          template:
            '<label><input :value="value" :placeholder="placeholder" @input="$emit(\'change\', $event.target.value)" />' +
            '<span v-if="isError" class="input-error">{{ errorDescriptions }}</span></label>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

async function askToDelete(address: string): Promise<VueWrapper> {
  const wrapper = await openMenu(address);
  await wrapper.get('[data-testid="deleteWallet"]').trigger('click');
  await flushPromises();
  return wrapper;
}

const confirmButton = (wrapper: VueWrapper) => wrapper.get('[data-testid="deleteWalletConfirm"]');

async function typePassword(wrapper: VueWrapper, value: string) {
  await wrapper.get('[data-testid="deleteWalletPassword"] input').setValue(value);
}

describe('deleting a wallet from the wallet list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    useAccountsStore().accounts = structuredClone(accounts);
    mocks.getTotalBalances.mockResolvedValue([
      { address: SUBSTRATE, total: '1234.5', change: { amount: '0', percent: '0' }, hiddenValue: '200', hiddenCount: 1, unavailableCount: 1 },
    ]);
    mocks.forgetAccount.mockResolvedValue(true);
    mocks.validatePassword.mockImplementation(async (password: string) => password === 'master password');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks first: one click shows the wallet, its full balance, the export and the password, and deletes nothing', async () => {
    const wrapper = await askToDelete(SUBSTRATE);

    expect(mocks.forgetAccount).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="deleteWalletTitle"]').text()).toBe('deleteWallet.title:{"name":"Savings"}');
    // The full balance with hidden assets and what failed to load named, as in the wallet list.
    expect(wrapper.get('[data-testid="fiatBalance"]').text()).toContain('1,234.50');
    expect(wrapper.get('[data-testid="balanceCaption"]').text()).toBe('portfolioPage.inclHidden · portfolioPage.balanceStatus.failed');
    expect(wrapper.find('[data-testid="deleteWalletExport"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="deleteWalletArchived"]').exists()).toBe(true);
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('deletes nothing with a wrong password, and says so', async () => {
    const wrapper = await askToDelete(SUBSTRATE);

    await typePassword(wrapper, 'not it');
    await confirmButton(wrapper).trigger('click');
    await flushPromises();

    expect(mocks.validatePassword).toHaveBeenCalledExactlyOnceWith('not it');
    expect(mocks.forgetAccount).not.toHaveBeenCalled();
    expect(wrapper.get('.input-error').text()).toBe('common.invalidPassword');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('deletes the wallet only after the master password, then closes', async () => {
    const wrapper = await askToDelete(SUBSTRATE);

    await typePassword(wrapper, 'master password');
    await confirmButton(wrapper).trigger('click');
    await flushPromises();

    expect(mocks.forgetAccount).toHaveBeenCalledExactlyOnceWith(SUBSTRATE, 'native');
    expect(mocks.validatePassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.forgetAccount.mock.invocationCallOrder[0]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('cancels without asking the background anything', async () => {
    const wrapper = await askToDelete(SUBSTRATE);

    await typePassword(wrapper, 'master password');
    await wrapper.get('[data-testid="deleteWalletCancel"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(mocks.validatePassword).not.toHaveBeenCalled();
    expect(mocks.forgetAccount).not.toHaveBeenCalled();
  });

  it('stays open and says nothing changed when the background could not keep the keys', async () => {
    mocks.forgetAccount.mockResolvedValueOnce(false);
    const wrapper = await askToDelete(SUBSTRATE);

    await typePassword(wrapper, 'master password');
    await confirmButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="deleteWalletFailed"]').text()).toBe('deleteWallet.failed');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('opens the recovery phrase export of this wallet, selected first', async () => {
    const wrapper = await askToDelete(TON);

    await wrapper.get('[data-testid="deleteWalletExport"]').trigger('click');
    await flushPromises();

    expect(useAccountsStore().selectedWallet.address).toBe(TON);
    expect(mocks.updateCurrentAccount).toHaveBeenCalledExactlyOnceWith(TON, WalletEcosystem.Ton);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Export', params: { network: 'ton mainnet' } });
    expect(wrapper.emitted('closeSelectWalletPopup')).toHaveLength(1);
    expect(mocks.forgetAccount).not.toHaveBeenCalled();
  });

  it('asks a wallet from the mobile app, which has no keys here, only to confirm', async () => {
    const wrapper = await askToDelete(MOBILE);

    expect(wrapper.find('[data-testid="deleteWalletPassword"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="deleteWalletExport"]').exists()).toBe(false);
    await confirmButton(wrapper).trigger('click');
    await flushPromises();

    expect(mocks.validatePassword).not.toHaveBeenCalled();
    expect(mocks.forgetAccount).toHaveBeenCalledExactlyOnceWith(MOBILE, 'mobile');
  });

  it('goes to the welcome screen after the last wallet is deleted', async () => {
    useAccountsStore().accounts = structuredClone(accounts.slice(0, 1));
    const wrapper = await askToDelete(SUBSTRATE);

    await typePassword(wrapper, 'master password');
    await confirmButton(wrapper).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
  });
});
