import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addAccount: vi.fn(),
  updatePairMeta: vi.fn(),
  generateMnemonic: vi.fn(),
  push: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  addAccount: mocks.addAccount,
  forgetAccount: vi.fn(),
  isDerivationPathValid: vi.fn(async () => true),
  isJsonValid: vi.fn(async () => ({ value: true })),
  jsonRestore: vi.fn(),
  windowOpen: vi.fn(),
  updatePairMeta: mocks.updatePairMeta,
  generateMnemonic: mocks.generateMnemonic,
  mnemonicValidate: vi.fn(async () => true),
  tonImportCandidates: vi.fn(),
}));
vi.mock('@/router/routes', () => ({ Components: { AddWallet: 'AddWallet', Welcome: 'Welcome', Wallet: 'Wallet' } }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ accounts: [], selectedWallet: { address: '5SelectedWallet', name: 'Existing wallet' } }),
}));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));
vi.mock('@/util/universalWalletKeyringFields', () => ({ deriveUniversalWalletKeyringFields: () => ({}) }));

import { ADD_WALLET_PATH } from '@/router/accountFlowPaths';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import AddEthereumAccountPopup from '@/screens/accounts/AddEthereumAccountPopup.vue';

// A public test phrase.
const PHRASE = 'follow group ski turtle dad bleak relief cry tray fat roast life';
const Empty = defineComponent({ render: () => h('div') });

// Settings > Accounts > Ethereum "+": the route its popup opens.
const openFromAccounts = async (button: number) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Empty },
      { path: ADD_WALLET_PATH, name: 'AddWallet', component: Empty },
    ],
  });
  await router.push('/');
  const popup = mount(AddEthereumAccountPopup, {
    global: {
      plugins: [router],
      stubs: {
        Popup: { template: '<div><slot /></div>' },
        BorderButton: { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')" />' },
      },
    },
  });
  await popup.findAll('button')[button].trigger('click');
  await flushPromises();
  // Read before unmounting: the router resets its route when its last app unmounts.
  const route = router.currentRoute.value;
  popup.unmount();

  return route;
};

const mountAddWallet = (route: RouteLocationNormalizedLoaded) =>
  shallowMount(AddWallet, {
    global: {
      mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $route: route, $router: { push: mocks.push } },
      stubs: { CircleButton: true, FButton: true, NotificationPopup: true },
    },
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.generateMnemonic.mockResolvedValue(PHRASE);
  mocks.addAccount.mockImplementation(async (_suri: string, type: string) => (type === 'ethereum' ? '0xNewEth' : '5NewWallet'));
  mocks.updatePairMeta.mockResolvedValue(true);
});

describe('Adding an Ethereum account to the selected wallet', () => {
  it('creates only the Ethereum account, links it to the selected wallet, and then opens the wallet', async () => {
    const route = await openFromAccounts(0);
    expect(route.name).toBe('AddWallet');
    expect(route.params.type).toBe('create');

    const wrapper = mountAddWallet(route);
    await flushPromises();
    expect(wrapper.vm.isOnlyEthereumAccount).toBe(true);
    // The nickname step is skipped: the phrase is generated and shown at once.
    expect(mocks.generateMnemonic).toHaveBeenCalledOnce();
    expect(wrapper.vm.step).toBe(2);
    expect(wrapper.vm.header).toBe('addWallet.backupPassphrase');

    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(3);
    await wrapper.setData({ selectedMnemonicElements: PHRASE.split(' ').map((word, initialIndex) => ({ word, initialIndex })) });
    let linked!: (value: boolean) => void;
    mocks.updatePairMeta.mockReturnValueOnce(new Promise<boolean>((resolve) => { linked = resolve; }));
    await wrapper.vm.proceed();
    await flushPromises();

    expect(mocks.addAccount).toHaveBeenCalledOnce();
    const [suri, type, meta, , freshGeneration] = mocks.addAccount.mock.calls[0];
    expect(suri).toBe(`${PHRASE}/m/44'/60'/0'/0/0`);
    expect(type).toBe('ethereum');
    expect(meta.name).toBe('Existing wallet');
    expect(freshGeneration).toBe(true);
    expect(mocks.updatePairMeta).toHaveBeenCalledExactlyOnceWith('5SelectedWallet', { ethereumAddress: '0xNewEth' });
    // Nothing is reported or opened until the link is saved.
    expect(wrapper.vm.savedSuccessfully).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();

    linked(true);
    await flushPromises();
    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it('imports a phrase as the Ethereum account of the selected wallet', async () => {
    const route = await openFromAccounts(1);
    expect(route.params.type).toBe('import');

    const wrapper = mountAddWallet(route);
    await flushPromises();
    expect(wrapper.vm.header).toBe('addWallet.addEthereumAccount');
    expect(wrapper.vm.disabledProceed).toBe(true);
    await wrapper.setData({ mnemonic: PHRASE });
    expect(wrapper.vm.disabledProceed).toBe(false);

    await wrapper.vm.proceed();
    await flushPromises();
    expect(wrapper.vm.step).toBe(4);
    expect(mocks.addAccount).toHaveBeenCalledOnce();
    expect(mocks.addAccount.mock.calls[0].slice(0, 2)).toEqual([`${PHRASE}/m/44'/60'/0'/0/0`, 'ethereum']);
    expect(mocks.updatePairMeta).toHaveBeenCalledExactlyOnceWith('5SelectedWallet', { ethereumAddress: '0xNewEth' });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it('offers Retry when the link cannot be saved, and does not open the wallet', async () => {
    const wrapper = mountAddWallet(await openFromAccounts(1));
    await flushPromises();
    await wrapper.setData({ mnemonic: PHRASE });
    mocks.updatePairMeta.mockRejectedValueOnce(new Error('Public storage failure'));

    await wrapper.vm.proceed();
    await flushPromises();
    expect(wrapper.vm.flowError).toBe(true);
    expect(wrapper.vm.savedSuccessfully).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();

    await wrapper.vm.proceed();
    await flushPromises();
    expect(mocks.updatePairMeta).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it('goes Back one visible step at a time', async () => {
    const create = mountAddWallet(await openFromAccounts(0));
    await flushPromises();
    await create.vm.proceed();
    expect(create.vm.step).toBe(3);
    create.vm.back();
    await flushPromises();
    expect(create.vm.step).toBe(2);
    create.vm.back();
    await flushPromises();
    expect(create.vm.step).toBe(0);
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'Welcome' });
    create.unmount();

    mocks.push.mockReset();
    const restore = mountAddWallet(await openFromAccounts(1));
    await flushPromises();
    await restore.setData({ mnemonic: PHRASE });
    mocks.addAccount.mockRejectedValueOnce(new Error('Public save failure'));
    await restore.vm.proceed();
    await flushPromises();
    expect(restore.vm.step).toBe(4);
    expect(restore.vm.flowError).toBe(true);
    // From the failed save back to the phrase, then out of the flow.
    restore.vm.back();
    await flushPromises();
    expect(restore.vm.step).toBe(1);
    restore.vm.back();
    await flushPromises();
    expect(restore.vm.step).toBe(0);
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'Welcome' });
    restore.unmount();
  });
});
