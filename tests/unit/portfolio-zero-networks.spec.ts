import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PortfolioZeroNetworks from '@/screens/wallet&asset/wallet/PortfolioZeroNetworks.vue';

const Icon = { name: 'Icon', props: ['icon', 'className', 'hover'], template: '<i class="icon-stub" />' };
const mountBlock = (props: Record<string, unknown>) =>
  mount(PortfolioZeroNetworks, {
    props: { label: '30 tokens · no balance', expanded: true, ...props },
    slots: { default: '<p class="zero-row">row</p>' },
    global: { components: { Icon } },
  });

describe('the zero-balance block', () => {
  it('opens and closes from its header in the normal list', async () => {
    const wrapper = mountBlock({ expanded: false });

    expect(wrapper.find('.icon-stub').exists()).toBe(true);
    await wrapper.get('.zero-header').trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
  });

  it('only names the block while a search or the Hidden filter holds it open', async () => {
    const wrapper = mountBlock({ locked: true });
    const header = wrapper.get('.zero-header');

    expect(header.attributes('aria-expanded')).toBe('true');
    expect(header.attributes('disabled')).toBeDefined();
    expect(header.find('.icon-stub').exists()).toBe(false);
    await header.trigger('click');
    expect(wrapper.emitted('toggle')).toBeUndefined();
    expect(wrapper.find('.zero-row').exists()).toBe(true);
  });
});
