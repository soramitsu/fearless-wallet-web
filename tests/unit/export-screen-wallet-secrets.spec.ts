import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  exportMnemonic: vi.fn(),
  exportJSON: vi.fn(),
  validatePassword: vi.fn(async () => true),
}));

vi.mock('@/extension/messaging', () => ({
  exportMnemonic: io.exportMnemonic,
  exportRowSeed: vi.fn(),
  exportJSON: io.exportJSON,
  validatePassword: io.validatePassword,
  getExtensionPassword: vi.fn(),
  rawSeedAvailable: vi.fn(async () => true),
  upsertNetworkMap: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('@/router/routes', () => ({
  Components: {
    AccountSetting: 'AccountSetting', ChainAccounts: 'ChainAccounts', Nodes: 'Nodes', Export: 'Export',
    Settings: 'Settings', AccountAccessRecovery: 'AccountAccessRecovery', AddWallet: 'AddWallet', Wallet: 'Wallet',
  },
}));

import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import Export from '@/screens/accounts/Export.vue';
import ExportForm from '@/screens/accounts/ExportForm.vue';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';

const A = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const B = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const phrase = (address: string) => `word-of-${address} two three four five six seven eight nine ten eleven twelve`;
const EXPORT = '/fearless/settings/accounts/network/polkadot/export';

// Every screen kept alive by its full path, as Main.vue did up to 4.2.3; App.vue keeps the whole shell alive as well.
const Shell = defineComponent({
  template: `<div class="main"><router-view v-slot="{ Component, route }"><keep-alive :max="20">
    <component :is="Component" :key="route.fullPath" class="main-child" />
  </keep-alive></router-view></div>`,
});
const Plain = (name: string) => defineComponent({ name, template: `<div class="${name}">${name}</div>` });

const stubs = {
  AboveForm: { template: '<div class="above-form"><slot /></div>' },
  Scroll: { template: '<div><slot /></div>' },
  InformationBlock: true,
  ValidatedInput: { props: ['value'], emits: ['change'], template: '<input class="password" :value="value" @input="$emit(\'change\', $event.target.value)" />' },
  FButton: { props: ['text', 'disabled'], emits: ['click'], template: '<button type="button" :data-text="text" @click="$emit(\'click\')">{{ text }}</button>' },
  InfoRow: { props: ['text'], emits: ['click'], template: '<div class="info-row" :data-text="text" @click="$emit(\'click\')">{{ text }}</div>' },
  Loader: { template: '<div class="loader" />' },
  FInput: { props: ['value'], template: '<div class="finput">{{ value }}</div>' },
  MnemonicBackupForm: { props: ['mnemonicArray'], template: '<div class="mnemonic">{{ mnemonicArray.join(\' \') }}<slot /></div>' },
  Hint: true, Popup: true, NotificationPopup: true, Icon: true,
};

function select(address: string, name: string) {
  useAccountsStore().setSelectedWallet({
    address, name, ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate, isMasterAccount: true, haveEntropy: true,
  } as never);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openExportScreen() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/fearless', component: Shell, children: [
        { path: 'settings', name: 'Settings', component: Plain('settings') },
        { path: 'portfolio', name: 'Wallet', component: Plain('portfolio') },
        { path: 'settings/accounts', component: AccountsLayout, children: [
          { path: '', name: 'AccountSetting', component: Plain('account-setting') },
          { path: 'network/:network/export', name: 'Export', component: Export },
        ] },
      ],
    }],
  });
  await router.push(EXPORT);
  const errors: unknown[] = [];
  const wrapper = mount({ template: '<router-view />' }, {
    attachTo: document.body,
    global: { plugins: [router], stubs, mocks: { $t: (key: string) => key }, config: { errorHandler: (e) => { errors.push(e); } } },
  });
  await flushPromises();
  const visible = () => document.querySelector('.main')!.innerHTML;
  const go = async (path: string) => { await router.push(path); await flushPromises(); };
  const showPhrase = async () => {
    await wrapper.get('input.password').setValue('master password');
    await wrapper.get('[data-testid="wantExportJsonBtn"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-text="accounts.mnemonic"]').trigger('click');
    await flushPromises();
  };
  return { wrapper, errors, visible, go, showPhrase };
}

describe('export screens and the wallet they were opened for', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    setActivePinia(createPinia());
    io.exportMnemonic.mockReset().mockImplementation(async (address: string) => ({ seed: phrase(address) }));
    io.exportJSON.mockReset();
    io.validatePassword.mockClear();
    select(A, 'Wallet A');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('asks for the password again and exports the selected wallet after the screen was left', async () => {
    const screen = await openExportScreen();
    await screen.showPhrase();
    expect(screen.visible()).toContain(phrase(A));

    // Close, switch to wallet B, and open Export again (as Delete wallet's "Export first" does).
    await screen.go('/fearless/settings');
    select(B, 'Wallet B');
    await screen.go('/fearless/portfolio');
    await screen.go(EXPORT);

    expect(screen.visible()).not.toContain('word-of-');
    expect((screen.wrapper.get('input.password').element as HTMLInputElement).value).toBe('');
    expect(io.exportMnemonic).toHaveBeenCalledTimes(1);

    await screen.showPhrase();
    expect(io.exportMnemonic).toHaveBeenLastCalledWith(B, 'master password', WalletEcosystem.Substrate);
    expect(screen.visible()).toContain(phrase(B));
    expect(screen.visible()).not.toContain(phrase(A));
    expect(screen.errors).toEqual([]);
    screen.wrapper.unmount();
  });

  it('clears a password typed for one wallet when another is selected', async () => {
    const screen = await openExportScreen();
    await screen.wrapper.get('input.password').setValue('master password');

    select(B, 'Wallet B');
    await flushPromises();

    expect((screen.wrapper.get('input.password').element as HTMLInputElement).value).toBe('');
    screen.wrapper.unmount();
  });

  it('does not carry a password check that ends after another wallet was selected', async () => {
    const check = deferred<boolean>();
    io.validatePassword.mockImplementationOnce(() => check.promise);
    const screen = await openExportScreen();
    await screen.wrapper.get('input.password').setValue('master password');
    await screen.wrapper.get('[data-testid="wantExportJsonBtn"]').trigger('click');

    select(B, 'Wallet B');
    await flushPromises();
    check.resolve(true);
    await flushPromises();

    expect(screen.wrapper.find('[data-text="accounts.mnemonic"]').exists()).toBe(false);
    expect(screen.wrapper.find('input.password').exists()).toBe(true);
    screen.wrapper.unmount();
  });

  it('closes the phrase when another wallet is selected while it is shown', async () => {
    const screen = await openExportScreen();
    await screen.showPhrase();
    expect(screen.visible()).toContain(phrase(A));

    select(B, 'Wallet B');
    await flushPromises();

    expect(screen.visible()).not.toContain('word-of-');
    expect(screen.wrapper.find('input.password').exists()).toBe(true);
    screen.wrapper.unmount();
  });

  it('never shows a phrase that arrives after another wallet was selected', async () => {
    const reply = deferred<{ seed: string }>();
    io.exportMnemonic.mockImplementationOnce(() => reply.promise);
    const screen = await openExportScreen();
    await screen.showPhrase();
    expect(io.exportMnemonic).toHaveBeenCalledWith(A, 'master password', WalletEcosystem.Substrate);

    select(B, 'Wallet B');
    await flushPromises();
    reply.resolve({ seed: phrase(A) });
    await flushPromises();

    expect(screen.visible()).not.toContain('word-of-');
    screen.wrapper.unmount();
  });

  it('drops an export reply in the export form once its wallet is no longer selected', async () => {
    const reply = deferred<{ seed: string; restoresOtherAccount?: boolean }>();
    io.exportMnemonic.mockImplementationOnce(() => reply.promise);
    const wrapper = mount(ExportForm, {
      props: { password: 'master password', exportType: 'mnemonic' },
      global: { stubs, mocks: {
        $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $route: { params: { network: 'Polkadot' } }, $router: { push: vi.fn() },
      } },
    });
    await flushPromises();

    select(B, 'Wallet B');
    reply.resolve({ seed: phrase(A), restoresOtherAccount: true });
    await flushPromises();

    expect(wrapper.html()).not.toContain('word-of-');
    expect(wrapper.find('[data-testid="phraseRestoresOtherAccount"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
