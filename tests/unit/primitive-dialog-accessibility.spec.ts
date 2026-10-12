import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popup from '@/components/Popup.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import FInput from '@/components/FInput.vue';
import FiatsPopup from '@/screens/main/FiatsPopup.vue';
import Tabs from '@/components/Tabs.vue';
import TabButton from '@/components/TabButton.vue';
import Switcher from '@/components/Switcher.vue';
import Checkbox from '@/components/Checkbox.vue';
import AboveForm from '@/components/AboveForm.vue';

vi.mock('@/extension/messaging', () => ({ updateFiatSymbol: vi.fn(async () => undefined) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ fiats: [] }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedFiat: 'USD' }) }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const global = {
  mocks: { $t: (key: string) => key },
  components: { SelectPopup, FInput, TabButton },
  stubs: {
    FCorners: { template: '<div><slot /></div>' },
    Scroll: { template: '<div><slot /></div>' },
    SearchInput: { template: '<input aria-label="Search" />' },
    Icon: { template: '<span />' },
  },
};
afterEach(() => {
  document.body.innerHTML = '';
});

describe('shared dialog interactions', () => {
  it('restores and reacquires focus when a cached route sheet is reopened', async () => {
    const open = ref(false);
    const wrapper = mount(
      {
        components: { AboveForm },
        setup: () => ({ open }),
        template:
          '<div><button id="opener">Settings</button><KeepAlive><AboveForm v-if="open" header="Recovery" /></KeepAlive></div>',
      },
      { attachTo: document.body, global }
    );
    const opener = wrapper.get<HTMLButtonElement>('#opener');
    opener.element.focus();
    for (let attempt = 0; attempt < 2; attempt++) {
      open.value = true;
      await nextTick();
      await nextTick();
      expect(wrapper.get('[role="dialog"]').element.contains(document.activeElement)).toBe(true);
      open.value = false;
      await nextTick();
      expect(document.activeElement).toBe(opener.element);
    }
    wrapper.unmount();
  });

  it('contains sheet focus, restores its opener and leaves contained panels in the page flow', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(AboveForm, {
      props: { header: 'Recovery' },
      attachTo: document.body,
      global,
      slots: { default: '<button id="sheet-export">Export</button>' },
    });
    await nextTick();
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Recovery');
    const close = wrapper.get('button');
    expect(document.activeElement).toBe(close.element);
    await close.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.get('#sheet-export').element);
    await wrapper.get('#sheet-export').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeHandler')).toHaveLength(1);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
    const panel = mount(AboveForm, { props: { contained: true }, attachTo: document.body, global });
    await nextTick();
    expect(panel.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(opener);
    panel.unmount();
  });

  it('emits one close through the real currency picker component stack', async () => {
    const close = vi.fn();
    const wrapper = mount(FiatsPopup, { props: { onHandlerClose: close }, global });
    await wrapper.get('[data-testid="basicCloseBtn"]').trigger('click');
    expect(close).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('names the dialog, traps keyboard focus, closes with Escape and restores focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(Popup, {
      props: { headerText: 'Choose a network' },
      attachTo: document.body,
      global,
      slots: { default: '<button id="last-option">Polkadot</button>' },
    });
    await nextTick();
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Choose a network');
    const close = wrapper.get<HTMLButtonElement>('[data-testid="basicCloseBtn"]');
    expect(document.activeElement).toBe(close.element);
    await close.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.get('#last-option').element);
    await wrapper.get('#last-option').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(close.element);
    await close.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('handlerClose')).toHaveLength(1);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('does not dismiss a dialog whose close action was explicitly disabled', async () => {
    const wrapper = mount(Popup, { props: { showCloseButton: false, closeByBackground: false }, global });
    await wrapper.get('.popup-container').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('handlerClose')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not bypass a headerless acknowledgement dialog with Escape', async () => {
    const wrapper = mount(Popup, { props: { showHeader: false, closeByBackground: false }, global });
    await wrapper.get('.popup-container').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('handlerClose')).toBeUndefined();
    wrapper.unmount();
  });

  it('makes picker options native keyboard actions with selected state', async () => {
    const wrapper = mount(SelectPopup, {
      props: { value: 'dot', showIcon: false, options: [{ name: 'DOT · Polkadot', value: 'dot' }] },
      global,
    });
    const option = wrapper.get('button.row');
    expect(option.attributes('aria-pressed')).toBe('true');
    await option.trigger('click');
    expect(wrapper.emitted('toggleValue')).toEqual([['dot']]);
    wrapper.unmount();
  });
});

describe('shared input semantics', () => {
  it('associates labels and invalid state with each unique field and emits one change', async () => {
    const wrapper = mount(
      {
        template:
          '<div><FInput value="" placeholder="Address" is-error /><FInput value="" placeholder="Memo" type="textarea" /></div>',
      },
      { global }
    );
    const [first, second] = wrapper.findAllComponents(FInput);
    const input = first.get('input');
    expect(input.attributes('id')).toBeTruthy();
    expect(first.get('label').attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(second.get('textarea').attributes('id')).not.toBe(input.attributes('id'));
    await input.setValue('5Grw');
    expect(first.emitted('change')).toEqual([['5Grw']]);
    wrapper.unmount();
  });
});

describe('shared selection controls', () => {
  it('moves keyboard selection through tabs and wraps at the last tab', async () => {
    const tabs = { token: { name: 'token', label: 'By token' }, network: { name: 'network', label: 'By network' } };
    const wrapper = mount(Tabs, { props: { activeTab: 'token', tabs }, attachTo: document.body, global });
    const buttons = wrapper.findAll<HTMLButtonElement>('[role="tab"]');
    expect(buttons[0].attributes('aria-selected')).toBe('true');
    expect(buttons[1].attributes('tabindex')).toBe('-1');
    buttons[0].element.focus();
    await buttons[0].trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual([tabs.network]);
    expect(document.activeElement).toBe(buttons[1].element);
    await wrapper.setProps({ activeTab: 'network' });
    expect(buttons[1].attributes('aria-selected')).toBe('true');
    await buttons[1].trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:activeTab')?.[1]).toEqual([tabs.token]);
    expect(document.activeElement).toBe(buttons[0].element);
    wrapper.unmount();
  });

  it('announces switch state and preserves native disabled behavior', async () => {
    const wrapper = mount(Switcher, { props: { value: true, ariaLabel: 'Show DOT' } });
    const input = wrapper.get('input');
    expect(input.attributes('role')).toBe('switch');
    expect(input.attributes('aria-label')).toBe('Show DOT');
    expect(input.attributes('aria-checked')).toBe('true');
    await input.setValue(false);
    expect(wrapper.emitted('change')).toEqual([[false]]);
    await wrapper.setProps({ disabled: true });
    expect(input.element.disabled).toBe(true);
    wrapper.unmount();
  });

  it('keeps acknowledgement checkboxes labelled and operable through the native input', async () => {
    const wrapper = mount(Checkbox, { props: { label: 'I have saved my backup', value: false } });
    await wrapper.get('input').setValue(true);
    expect(wrapper.emitted('change')).toEqual([[true]]);
    expect(wrapper.get('label').text()).toBe('I have saved my backup');
    wrapper.unmount();
  });
});
