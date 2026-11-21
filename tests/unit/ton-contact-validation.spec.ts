import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Address } from '@ton/core';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';

const state = vi.hoisted(() => ({ isTon: true, set: vi.fn(), validate: vi.fn(() => false) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: { isTon: state.isTon } }) }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: async () => ({ addressBook: {} }), set: state.set } }));
vi.mock('@/util/BaseApi', () => ({ default: { validateAddress: state.validate, encodeAddress: (address: string) => address } }));

beforeEach(() => { state.isTon = true; state.set.mockClear(); state.validate.mockReset().mockReturnValue(false); });

function render(network = 'ton mainnet') {
  return mount(EditAddressBook, {
    props: { _name: 'Recipient', _address: '', network },
    global: {
      mocks: { $t: (value: string) => value },
      stubs: { FInput: true, ValidatedInput: true, Checkbox: true, FButton: true },
    },
  });
}

describe('TON address-book recipients', () => {
  it.each(['not an address', '0x1234', '0:' + 'g'.repeat(64)])('rejects invalid address %s and prevents saving it', async (address) => {
    const wrapper = render();
    await wrapper.setData({ address });
    expect(wrapper.vm.isErrorAddress).toBe(true);
    expect(wrapper.vm.buttonDisabled).toBe(true);
    await wrapper.vm.updateContact();
    expect(state.set).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([false, true])('accepts valid TON addresses for legacy/universal wallets (legacy=%s)', async (legacy) => {
    state.isTon = legacy;
    const raw = '0:' + 'ab'.repeat(32);
    for (const address of [raw, Address.parse(raw).toString()]) {
      const wrapper = render('ton testnet');
      await wrapper.setData({ address: ` ${address} ` });
      expect(wrapper.vm.isErrorAddress).toBe(false);
      expect(wrapper.vm.buttonDisabled).toBe(false);
      await wrapper.vm.updateContact();
      expect(state.set).toHaveBeenLastCalledWith({ addressBook: { 'ton testnet': [{ name: 'Recipient', address }] } });
      wrapper.unmount();
    }
  });

  it('retains non-TON address validation', async () => {
    state.isTon = false;
    const wrapper = render('polkadot');
    await wrapper.setData({ address: 'invalid' });
    expect(wrapper.vm.isErrorAddress).toBe(true);
    expect(state.validate).toHaveBeenCalledWith('invalid', 'polkadot');
    wrapper.unmount();
  });
});
