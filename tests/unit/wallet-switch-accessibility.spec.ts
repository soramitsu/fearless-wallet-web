import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
vi.mock('@/extension/messaging', () => ({ getTotalBalances: async () => [] }));
import WalletInfo from '@/screens/main/WalletInfo.vue';
it('offers distinct native wallet selection and details controls without selecting from details', async () => {
  const wrapper = mount(WalletInfo, { props: { name: 'Wallet fixture', address: 'public-address', isSelected: true }, global: { mocks: { $t: (key: string) => key }, stubs: { Icon: true, WalletBalance: true, FCorners: { template: '<div><slot /></div>' } } } });
  await flushPromises();
  const controls = wrapper.findAll('button');
  expect(controls).toHaveLength(2);
  expect(controls[0].attributes('aria-label')).toBe('Wallet fixture');
  expect(controls[0].attributes('aria-pressed')).toBe('true');
  await controls[1].trigger('click');
  expect(wrapper.emitted('setShowWalletDetailsPopupVisible')).toHaveLength(1);
  expect(wrapper.emitted('setWallet')).toBeUndefined();
  await controls[0].trigger('click');
  expect(wrapper.emitted('setWallet')).toHaveLength(1);
  wrapper.unmount();
});
