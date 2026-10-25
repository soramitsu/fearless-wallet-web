import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import CircleButton from '@/components/CircleButton.vue';

describe('icon actions', () => {
  it('uses a named native button and emits one activation', async () => {
    const wrapper = mount(CircleButton, {
      props: { iconName: 'chevron-left', backgroundColor: 'none' },
      global: { stubs: { Icon: true, Tooltip: true } },
    });
    const button = wrapper.get('button');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('ux.back');
    await button.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
  it('honors explicit names and prevents disabled actions', async () => {
    const wrapper = mount(CircleButton, {
      props: { iconName: 'copy', backgroundColor: 'none', ariaLabel: 'Copy recipient address', disabled: true },
      global: { stubs: { Icon: true, Tooltip: true } },
    });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Copy recipient address');
    expect(wrapper.get('button').element.disabled).toBe(true);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
