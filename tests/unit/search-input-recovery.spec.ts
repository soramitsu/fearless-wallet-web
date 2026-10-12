import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { expect, it, vi } from 'vitest';
import Popup from '@/components/Popup.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import FiatsPopup from '@/screens/main/FiatsPopup.vue';

vi.mock('@/extension/messaging', () => ({ updateFiatSymbol: vi.fn(async () => undefined) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ fiats: [
  { name: 'US Dollar', id: 'USD' }, { name: 'Euro', id: 'EUR' },
] }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedFiat: 'USD' }) }));
import FInput from '@/components/FInput.vue';
import SearchInput from '@/components/SearchInput.vue';

function search(value = 'DOT') {
  return mount(SearchInput, {
    attachTo: document.body,
    props: { value, placeholder: 'common.searchCurrency', width: '100%' },
    global: {
      components: { FInput },
      mocks: { $t: (key: string) => key },
      stubs: { Icon: true, FCorners: { template: '<div><slot /></div>' } },
    },
  });
}

it('clears once through a named native control and returns keyboard focus to the search field', async () => {
  const wrapper = search();
  try {
    const button = wrapper.get('button[data-testid="clearSearch"]');
    expect(button.attributes('aria-label')).toBe('common.searchCurrency: browserTabs.reset');
    await button.trigger('click');
    await nextTick();
    expect(wrapper.emitted('change')).toEqual([['']]);
    expect(document.activeElement).toBe(wrapper.get('input').element);
    await wrapper.setProps({ value: '' });
    expect(wrapper.find('[data-testid="clearSearch"]').exists()).toBe(false);
  } finally { wrapper.unmount(); }
});

it('Escape clears a query before reaching a containing dialog, then permits the dialog Escape action', async () => {
  const wrapper = search();
  const dialogEscape = vi.fn();
  document.body.addEventListener('keydown', dialogEscape);
  try {
    await wrapper.get('input').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('change')).toEqual([['']]);
    expect(dialogEscape).not.toHaveBeenCalled();
    await wrapper.setProps({ value: '' });
    await wrapper.get('input').trigger('keydown', { key: 'Escape' });
    expect(dialogEscape).toHaveBeenCalledOnce();
    expect(wrapper.emitted('change')).toHaveLength(1);
  } finally {
    document.body.removeEventListener('keydown', dialogEscape);
    wrapper.unmount();
  }
});

it('IME cancellation and ordinary keys cannot clear an unfinished query', async () => {
  const wrapper = search('検索');
  try {
    await wrapper.get('input').trigger('keydown', { key: 'Escape', isComposing: true });
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('change')).toBeUndefined();
  } finally { wrapper.unmount(); }
});


it('keeps the real dialog search controlled and clears it before dismissal', async () => {
  const wrapper = mount(Popup, {
    attachTo: document.body,
    props: { showSearch: true },
    global: {
      components: { FInput, SearchInput },
      mocks: { $t: (key: string) => key },
      stubs: { Icon: true, FCorners: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' } },
    },
  });
  try {
    await wrapper.get('input').setValue('Dollar');
    expect(wrapper.emitted('handlerFilter')).toEqual([['Dollar']]);
    expect(wrapper.find('[data-testid="clearSearch"]').exists()).toBe(true);
    await wrapper.get('input').trigger('keydown', { key: 'Escape', isComposing: true });
    expect(wrapper.emitted('handlerClose')).toBeUndefined();
    expect(wrapper.emitted('handlerFilter')).toEqual([['Dollar']]);
    await wrapper.get('input').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('handlerFilter')).toEqual([['Dollar'], ['']]);
    expect(wrapper.emitted('handlerClose')).toBeUndefined();
    await wrapper.get('input').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('handlerClose')).toHaveLength(1);
  } finally { wrapper.unmount(); }
});


it('filters real currency rows from the typed query and restores them when cleared', async () => {
  const wrapper = mount(FiatsPopup, {
    attachTo: document.body,
    global: {
      components: { FInput, SearchInput, SelectPopup },
      mocks: { $t: (key: string) => key },
      stubs: { Icon: true, ExternalLogo: true, FCorners: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' } },
    },
  });
  try {
    expect(wrapper.findAll('button.row')).toHaveLength(2);
    await wrapper.get('input').setValue('Dollar');
    expect(wrapper.findAll('button.row')).toHaveLength(1);
    expect(wrapper.get('button.row').text()).toBe('US Dollar');
    await wrapper.get('[data-testid="clearSearch"]').trigger('click');
    expect(wrapper.findAll('button.row')).toHaveLength(2);
    expect(document.activeElement).toBe(wrapper.get('input').element);
  } finally { wrapper.unmount(); }
});
