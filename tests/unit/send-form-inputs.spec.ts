import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ balances: [], fiatSymbol: '$' }) }));

import SelectInput from '@/components/SelectInput.vue';
import RecipientInput from '@/screens/wallet&asset/RecipientInput.vue';

const global = {
  mocks: { $t: (key: string) => key, $n: (n: number) => String(n) },
  stubs: {
    Icon: true,
    ExternalLogo: true,
    Rotate: { template: '<span><slot /></span>' },
    FCorners: { template: '<div><slot /></div>' },
  },
};

describe('amount field', () => {
  it('shows a Max button where the form handles Max, and marks it while Max is on', async () => {
    const wrapper = mount(SelectInput, {
      props: { text: 'assets.amount', asset: 'eth', amount: '', value: '0', totalAmount: 0.0742, isRotate: false },
      global,
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="maxBtn"]').exists()).toBe(false);

    await wrapper.setProps({ showMax: true });
    const max = wrapper.get('button[data-testid="maxBtn"]');

    expect(max.text()).toBe('common.max');
    expect(max.attributes('aria-pressed')).toBe('false');

    await max.trigger('click');
    expect(wrapper.emitted('setMax')).toHaveLength(1);

    await wrapper.setProps({ maxActive: true });
    expect(max.attributes('aria-pressed')).toBe('true');
    expect(max.classes()).toContain('max-button-active');

    await wrapper.setProps({ readonly: true });
    expect(max.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});

describe('recipient field', () => {
  const mountRecipient = (props: Record<string, unknown> = {}) =>
    mount(RecipientInput, { props: { value: '', ...props }, global });

  it('is a normal text field that takes a typed or pasted address, without stray whitespace', async () => {
    const wrapper = mountRecipient();
    const input = wrapper.get('input[data-testid="sendToInput"]');

    expect(input.attributes('readonly')).toBeUndefined();
    expect(input.attributes('autocomplete')).toBe('off');
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
    expect(wrapper.get('label').text()).toBe('assets.sendTo');

    await input.setValue(' 0x05572Ab \n');

    expect(wrapper.emitted('update')?.at(-1)).toEqual(['0x05572Ab']);
    expect((input.element as HTMLInputElement).value).toBe('0x05572Ab');
    wrapper.unmount();
  });

  it('clears the address with its button, which shows only when there is one', async () => {
    const wrapper = mountRecipient();

    expect(wrapper.find('[data-testid="clearRecipient"]').exists()).toBe(false);

    await wrapper.setProps({ value: '0x05572Ab' });
    await wrapper.get('[data-testid="clearRecipient"]').trigger('click');

    expect(wrapper.emitted('update')?.at(-1)).toEqual(['']);
    wrapper.unmount();
  });

  it('flags an invalid address once the field is left, not while it is typed', async () => {
    const wrapper = mountRecipient({ value: '0x0557', isError: true });
    const input = wrapper.get('input');

    await input.trigger('focus');
    expect(input.classes()).not.toContain('error-input');

    await input.trigger('blur');
    expect(input.classes()).toContain('error-input');
    expect(input.attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});
