import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ExternalLogo from '@/components/ExternalLogo.vue';

const getNetwork = vi.hoisted(() => vi.fn((name: string) => name === 'Polkadot'
  ? { icon: 'https://icons.invalid/polkadot.svg' }
  : undefined));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork }) }));

describe('ExternalLogo unavailable artwork', () => {
  it('uses packaged artwork immediately when no image is supplied', () => {
    const wrapper = mount(ExternalLogo);
    expect(wrapper.get('img').attributes('src')).toBeTruthy();
    expect(wrapper.get('img').attributes('src')).not.toMatch(/^https?:/);
    expect(wrapper.get('img').attributes('alt')).toBe('');
  });

  it('replaces a failed registry icon without losing its name or dimensions', async () => {
    const wrapper = mount(ExternalLogo, { props: { name: 'Polkadot', alt: 'Polkadot', width: 48 } });
    expect(wrapper.get('img').attributes('src')).toBe('https://icons.invalid/polkadot.svg');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('img').attributes('src')).toBeTruthy();
    expect(wrapper.get('img').attributes('src')).not.toMatch(/^https?:/);
    expect(wrapper.get('img').attributes('alt')).toBe('Polkadot');
    expect(wrapper.get('img').attributes('width')).toBe('48');
    expect(wrapper.get('img').attributes('height')).toBe('48');
  });

  it('tries a newly supplied image after a previous image failed', async () => {
    const wrapper = mount(ExternalLogo, { props: { name: 'https://icons.invalid/a.svg' } });
    await wrapper.get('img').trigger('error');
    const fallback = wrapper.get('img').attributes('src');
    expect(fallback).not.toMatch(/^https?:/);
    await wrapper.setProps({ name: 'https://icons.invalid/b.svg' });
    expect(wrapper.get('img').attributes('src')).toBe('https://icons.invalid/b.svg');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('img').attributes('src')).toBe(fallback);
  });

  it('preserves natural artwork proportions through failure and story replacement', async () => {
    const wrapper = mount(ExternalLogo, { props: { name: 'https://icons.invalid/story.svg', alt: 'Story', width: 330, fit: 'natural' } });
    expect(wrapper.get('img').attributes('height')).toBeUndefined();
    expect(wrapper.get('img').element.style.height).toBe('auto');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('img').attributes('src')).not.toMatch(/^https?:/);
    await wrapper.setProps({ name: 'https://icons.invalid/next.svg', alt: 'Next story' });
    expect(wrapper.get('img').attributes('src')).toBe('https://icons.invalid/next.svg');
    expect(wrapper.get('img').attributes('alt')).toBe('Next story');
    expect(wrapper.get('img').attributes('width')).toBe('330');
    expect(wrapper.get('img').element.style.height).toBe('auto');
  });

  it('ignores an error from a replaced image, including when its URL is selected again', async () => {
    const wrapper = mount(ExternalLogo, { props: { name: 'https://icons.invalid/a.svg' } });
    const oldImage = wrapper.get('img').element;
    await wrapper.setProps({ name: 'https://icons.invalid/b.svg' });
    await wrapper.setProps({ name: 'https://icons.invalid/a.svg' });
    oldImage.dispatchEvent(new Event('error'));
    await nextTick();
    expect(wrapper.get('img').attributes('src')).toBe('https://icons.invalid/a.svg');
  });

  it('keeps a local image and does not cycle on a fallback decoding failure', async () => {
    const wrapper = mount(ExternalLogo, { props: { name: '/assets/local-token.svg', alt: 'Token' } });
    expect(wrapper.get('img').attributes('src')).toBe('/assets/local-token.svg');
    await wrapper.get('img').trigger('error');
    const fallback = wrapper.get('img').attributes('src');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('img').attributes('src')).toBe(fallback);
  });
});
