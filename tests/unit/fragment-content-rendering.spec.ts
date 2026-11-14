import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import WalletConnectHeader from '@/screens/walletConnect/WalletConnectHeader.vue';
import Favicon from '@/components/Favicon.vue';
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => `translated:${key}` }) }));
const global = { stubs: { ExternalLogo: { name: 'ExternalLogo', props: ['name', 'width'], template: '<span :data-image="name" />' } } };
describe('visible content in Vue multi-root templates', () => {
  it('renders both the definition label and numeric value', async () => {
    const wrapper = mount(InfoItem, { props: { name: 'Network', value: 42 } });
    expect(wrapper.get('dt').text()).toBe('Network'); expect(wrapper.get('dd').text()).toBe('42');
    await wrapper.setProps({ name: 'Amount', value: '1.25 DOT' }); expect(wrapper.get('dt').text()).toBe('Amount'); expect(wrapper.get('dd').text()).toBe('1.25 DOT'); wrapper.unmount();
  });
  it('renders app identity, translated subtext and favicon together', () => {
    const wrapper = mount(WalletConnectHeader, { props: { url: 'https://public.example/connect', title: 'Public app', subtext: 'permissions' }, global });
    expect(wrapper.get('[data-testid="header"]').text()).toBe('Public app'); expect(wrapper.get('.subtext').text()).toBe('translated:permissions');
    expect(wrapper.getComponent({ name: 'ExternalLogo' }).props('name')).toBe('https://icons.duckduckgo.com/ip3/public.example.ico'); wrapper.unmount();
  });
  it.each(['', 'not a URL', 'about:blank'])('handles a missing or unusable favicon URL (%s)', url => {
    const wrapper = mount(Favicon, { props: { url }, global }); expect(wrapper.getComponent({ name: 'ExternalLogo' }).props('name')).toBe(''); wrapper.unmount();
  });
});
