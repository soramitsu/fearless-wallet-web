import { mount } from '@vue/test-utils';

import SelectPopup from '@/components/SelectPopup.vue';

type Option = {
  name: string;
  value: string;
  icon: string;
  iconType: string;
  isAll?: true;
};

const mountSelectPopup = (options: Option[], value?: string) =>
  mount(SelectPopup, {
    props: {
      options,
      value,
      showIcon: false,
    },
    global: {
      stubs: {
        Popup: { template: '<div><slot /></div>' },
        Icon: { template: '<span />' },
        Identicon: { template: '<span />' },
        ExternalLogo: { template: '<span />' },
      },
    },
  });

describe('SelectPopup', () => {
  it('moves the selected option after the all option without mutating props', () => {
    const options: Option[] = [
      { name: 'All', value: 'all', icon: 'all', iconType: 'asset', isAll: true },
      { name: 'Zed', value: 'zed', icon: 'zed', iconType: 'asset' },
      { name: 'Alpha', value: 'alpha', icon: 'alpha', iconType: 'asset' },
    ];
    const original = options.map(({ value }) => value);

    const wrapper = mountSelectPopup(options, 'alpha');

    expect(wrapper.findAll('[data-testid="description"]').map((row) => row.text())).toEqual(['All', 'Alpha', 'Zed']);
    expect(options.map(({ value }) => value)).toEqual(original);
  });

  it('keeps option order stable when the selected value is missing or adversarial', () => {
    const options: Option[] = [
      { name: 'One', value: 'one', icon: 'one', iconType: 'asset' },
      { name: 'Two', value: 'two', icon: 'two', iconType: 'asset' },
    ];

    const wrapper = mountSelectPopup(options, '<script>alert(1)</script>');

    expect(wrapper.findAll('[data-testid="description"]').map((row) => row.text())).toEqual(['One', 'Two']);
    expect(options.map(({ value }) => value)).toEqual(['one', 'two']);
  });

  it('shows a warning for empty option sets', () => {
    const wrapper = mountSelectPopup([], 'missing');

    expect(wrapper.get('[data-testid="warning"]').text()).toBe('Nothing found');
  });
});
