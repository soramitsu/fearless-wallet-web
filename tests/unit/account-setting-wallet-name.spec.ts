import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletEcosystem } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';

const io = vi.hoisted(() => ({ rename: vi.fn(async () => true) }));
vi.mock('@/extension/messaging', () => ({ accountUpdateName: io.rename, getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: { ChainAccounts: 'ChainAccounts', Wallet: 'Wallet' } }));

import AccountSetting from '@/screens/accounts/AccountSetting.vue';

const A = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const B = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const select = (address: string, name: string) =>
  useAccountsStore().setSelectedWallet({ address, name, ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate } as never);

const mountSetting = () => mount(AccountSetting, { global: {
  mocks: { $t: (key: string) => key, $router: { push: vi.fn() } },
  stubs: {
    InfoRow: true,
    FInput: { props: ['value'], emits: ['blur', 'change'],
      template: '<input class="name" :value="value" @blur="$emit(\'blur\')" @input="$emit(\'change\', $event.target.value)" />' },
  },
} });
const field = (wrapper: ReturnType<typeof mountSetting>) => (wrapper.get('input.name').element as HTMLInputElement).value;

describe('Wallet details name field', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    setActivePinia(createPinia());
    io.rename.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the name of a wallet selected while the screen is open and never renames it with the previous one', async () => {
    select(A, 'Wallet A');
    const wrapper = mountSetting();
    await flushPromises();
    expect(field(wrapper)).toBe('Wallet A');

    // Details for another wallet, opened from the header list while this screen stays on the same route.
    select(B, 'Wallet B');
    await flushPromises();
    expect(field(wrapper)).toBe('Wallet B');

    await wrapper.get('input.name').trigger('blur');
    expect(io.rename).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renames the selected wallet only when its name was changed', async () => {
    select(B, 'Wallet B');
    const wrapper = mountSetting();
    await flushPromises();

    await wrapper.get('input.name').trigger('blur');
    expect(io.rename).not.toHaveBeenCalled();

    await wrapper.get('input.name').setValue('Savings');
    await wrapper.get('input.name').trigger('blur');
    expect(io.rename).toHaveBeenCalledExactlyOnceWith(B, 'Savings', WalletEcosystem.Substrate);
    wrapper.unmount();
  });
});
