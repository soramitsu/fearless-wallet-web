import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import Identicon from '@/components/Identicon.vue';

vi.mock('@/util/BaseApi', () => ({
  default: {
    isEthereumAddress: (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address),
  },
}));

describe('Identicon', () => {
  it('renders Ethereum addresses as encoded SVG image data', () => {
    const wrapper = mount(Identicon, {
      props: {
        address: '0x0000000000000000000000000000000000000000',
      },
    });

    const image = wrapper.get('img');

    expect(image.attributes('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('renders non-Ethereum addresses through the Polkadot SVG component', () => {
    const wrapper = mount(Identicon, {
      props: {
        address: '5GrwvaEF5zXb26Fz9rcQpDWSfQp2BF7nLSJydyL7SS3QDuH8',
      },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('svg').attributes('width')).toBe('24');
  });

  it('does not inject payload-looking address text into rendered markup', () => {
    const wrapper = mount(Identicon, {
      props: {
        address: '"><script>alert(1)</script>',
      },
    });

    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('alert(1)');
  });
});
