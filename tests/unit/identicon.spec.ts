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

  it('renders SS58 addresses through the Polkadot SVG component', () => {
    const wrapper = mount(Identicon, {
      props: {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('svg').attributes('width')).toBe('24');
  });

  it.each([
    ['Bitcoin', 'tb1qghg59chv33mk54dle77ml708v9py8mjpdr9acx'],
    ['Iroha I105', 'testu\uff9b1Pw\uff71B9\uff88\uff74\uff87FV\uff91\uff90u\uff93b\uff93\uff8eyH2\uff79S\uff74\uff89R\uff99\uff98h\uff7d9RLZF\uff8a\uff98Y\uff76\uff887U5HV9'],
    ['Solana', 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'],
  ])('draws %s addresses as jdenticons instead of a blank Polkadot circle', (_format, address) => {
    const wrapper = mount(Identicon, { props: { address } });

    expect(wrapper.get('img').attributes('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(wrapper.find('svg').exists()).toBe(false);
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
