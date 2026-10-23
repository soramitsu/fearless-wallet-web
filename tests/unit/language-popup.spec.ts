import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  locale: { value: 'en-EN' },
  setLang: vi.fn(),
}));

vi.mock('@/controllers', () => ({
  accountController: {
    getLang: () => 'en-EN',
    setLang: mocks.setLang,
  },
}));

vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ locale: mocks.locale }),
}));

import { languageOptions } from '@/locales';
import LanguagePopup from '@/screens/main/LanguagePopup.vue';

const SelectPopupStub = defineComponent({
  name: 'SelectPopup',
  props: {
    options: { type: Array, required: true },
    value: { type: String, required: true },
  },
  emits: ['toggleValue', 'handlerClose'],
  template: '<div />',
});

describe('LanguagePopup', () => {
  beforeEach(() => {
    mocks.locale.value = 'en-EN';
    mocks.setLang.mockClear();
    document.documentElement.lang = 'en-EN';
    document.documentElement.dir = 'ltr';
  });

  it('offers Old Akkadian and persists it when selected', async () => {
    const wrapper = mount(LanguagePopup, {
      global: {
        stubs: { SelectPopup: SelectPopupStub },
      },
    });
    const select = wrapper.getComponent(SelectPopupStub);

    expect(select.props('options')).toEqual(languageOptions);
    expect(select.props('value')).toBe('en-EN');

    select.vm.$emit('toggleValue', 'akk-Latn-x-old');
    await nextTick();

    expect(mocks.locale.value).toBe('akk-Latn-x-old');
    expect(mocks.setLang).toHaveBeenCalledOnce();
    expect(mocks.setLang).toHaveBeenCalledWith('akk-Latn-x-old');
    expect(wrapper.emitted('handlerClose')).toHaveLength(1);
  });

  it('offers Classical Middle Egyptian hieroglyphs and persists them when selected', async () => {
    const wrapper = mount(LanguagePopup, {
      global: {
        stubs: { SelectPopup: SelectPopupStub },
      },
    });
    const select = wrapper.getComponent(SelectPopupStub);

    expect(select.props('options')).toEqual(languageOptions);
    expect(select.props('value')).toBe('en-EN');

    select.vm.$emit('toggleValue', 'egy-Egyp');
    await nextTick();

    expect(mocks.locale.value).toBe('egy-Egyp');
    expect(mocks.setLang).toHaveBeenCalledOnce();
    expect(mocks.setLang).toHaveBeenCalledWith('egy-Egyp');
    expect(document.documentElement.lang).toBe('egy-Egyp');
    expect(document.documentElement.dir).toBe('ltr');
    expect(wrapper.emitted('handlerClose')).toHaveLength(1);
  });
});
