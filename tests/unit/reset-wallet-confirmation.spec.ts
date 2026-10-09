import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  resetWallet: vi.fn(),
  t: vi.fn((key: string, values?: { phrase?: string }) =>
    key === 'welcome.enterReset' ? `To proceed, enter '${values?.phrase}'` : key
  ),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

vi.mock('@/extension/messaging', () => ({
  resetWallet: mocks.resetWallet,
}));

vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: mocks.t }),
}));

vi.mock('@/router/routes', () => ({
  Components: { Welcome: 'Welcome' },
}));

import ResetWallet from '@/screens/welcome/ResetWallet.vue';

const PassThroughStub = defineComponent({ template: '<div><slot /></div>' });
const FInputStub = defineComponent({
  props: {
    value: { type: String, required: true },
    placeholder: { type: String, required: true },
  },
  emits: ['change'],
  template: '<input :value="value" :placeholder="placeholder" @input="$emit(\'change\', $event.target.value)" />',
});
const FButtonStub = defineComponent({
  props: {
    disabled: { type: Boolean, required: true },
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">confirm</button>',
});

describe('ResetWallet confirmation phrase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows and accepts the same stable literal in every locale', async () => {
    const wrapper = mount(ResetWallet, {
      global: {
        stubs: {
          AboveForm: PassThroughStub,
          Scroll: PassThroughStub,
          Icon: true,
          FInput: FInputStub,
          FButton: FButtonStub,
        },
      },
    });

    const input = wrapper.get('input');
    const button = wrapper.get('button');

    expect(mocks.t).toHaveBeenCalledWith('welcome.enterReset', { phrase: 'Reset wallet' });
    expect(wrapper.text()).toContain("To proceed, enter 'Reset wallet'");
    expect(input.attributes('placeholder')).toBe('Reset wallet');
    expect(button.attributes()).toHaveProperty('disabled');

    await input.setValue('Kīsam nussiḫ');
    await nextTick();
    expect(button.attributes()).toHaveProperty('disabled');

    await input.setValue('Reset wallet');
    await nextTick();
    expect(button.attributes()).not.toHaveProperty('disabled');

    await button.trigger('click');
    expect(mocks.resetWallet).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Welcome' });
  });
});
