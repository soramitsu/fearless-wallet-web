import { mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import SearchResultStatus from '@/components/SearchResultStatus.vue';

afterEach(() => vi.useRealTimers());

it('announces only the settled result count, including zero, through a persistent polite region', async () => {
  vi.useFakeTimers();
  const wrapper = mount(SearchResultStatus, { props: { label: 'common.searchNetwork', count: 12 }, global: { mocks: { $t: () => 'Search in networks' } } });
  try {
    const status = wrapper.get('[role="status"]');
    const element = status.element;
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.attributes('aria-atomic')).toBe('true');
    expect(status.text()).toBe('');
    await vi.advanceTimersByTimeAsync(100);
    await wrapper.setProps({ count: 2 });
    await vi.advanceTimersByTimeAsync(199);
    expect(status.text()).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(status.text()).toBe('Search in networks: 2');
    await wrapper.setProps({ count: 0 });
    await vi.advanceTimersByTimeAsync(200);
    expect(status.text()).toBe('Search in networks: 0');
    expect(wrapper.get('[role="status"]').element).toBe(element);
    await wrapper.setProps({ active: false });
    expect(status.text()).toBe('');
  } finally { wrapper.unmount(); }
});

it('never announces unknown, invalid or stale unmounted counts', async () => {
  vi.useFakeTimers();
  const wrapper = mount(SearchResultStatus, { props: { label: 'Search' }, global: { mocks: { $t: (key: string) => key } } });
  try {
    for (const count of [null, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      await wrapper.setProps({ count });
      await vi.advanceTimersByTimeAsync(200);
      expect(wrapper.text()).toBe('');
    }
    await wrapper.setProps({ count: 5 });
    expect(vi.getTimerCount()).toBe(1);
  } finally { wrapper.unmount(); }
  expect(vi.getTimerCount()).toBe(0);
});
