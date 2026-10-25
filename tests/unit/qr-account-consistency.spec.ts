import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const encode = vi.hoisted(() => vi.fn());
vi.mock('qrcode', () => ({ default: { toDataURL: encode } }));
import QR from '@/components/QR.vue';

describe('QR account consistency', () => {
  it('never shows a previous account after a network/account switch', async () => {
    let finishFirst!: (value: string) => void;
    encode.mockImplementationOnce(() => new Promise<string>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce('data:image/png;base64,current');
    const wrapper = mount(QR, { props: { payload: 'public-address-a' } });
    await wrapper.setProps({ payload: 'public-address-b' });
    await flushPromises();
    expect(encode.mock.calls.map(([address]) => address)).toEqual(['public-address-a', 'public-address-b']);
    expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,current');
    finishFirst('data:image/png;base64,previous');
    await flushPromises();
    expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,current');
    await wrapper.setProps({ payload: '' });
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });
});
