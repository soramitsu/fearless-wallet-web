import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { svgToSymbol, wrapSvgSymbols } from '../../scripts/svg-symbol.mjs';
import warningArtwork from '@/assets/icons/info-triangle.svg?raw';
import Icon from '@/components/Icon.vue';

describe('Fearless artwork sprite', () => {
  it('keeps the complete original warning artwork inside its viewport', () => {
    const source = warningArtwork;
    expect(svgToSymbol(source, 'warning')).toContain('viewBox="0 0 43 40"');
    expect(svgToSymbol(source, 'warning')).toContain(source.match(/<path[\s\S]*<\/svg>/)![0].replace('</svg>', ''));
  });
  it('preserves an explicit viewport and dimensions for other icons', () => {
    expect(svgToSymbol('<svg viewBox="-1 -2 48 50" width="24" height="24"><path /></svg>', 'a')).toContain('viewBox="-1 -2 48 50"');
    expect(svgToSymbol('<svg width="32px" height="40"><path /></svg>', 'b')).toContain('viewBox="0 0 32 40"');
    expect(svgToSymbol('<svg><path /></svg>', 'c')).toContain('viewBox="0 0 24 24"');
  });
  it('parses the complete production sprite, including Polkaswap after the embedded loader image', () => {
    const files = Object.entries(import.meta.glob<string>('/src/assets/icons/*.svg', { query: '?raw', import: 'default', eager: true })).sort();
    const sprite = wrapSvgSymbols(files.map(([file, source]) => svgToSymbol(source, `icon-${file.split('/').at(-1)!.slice(0, -4)}`)));
    const document = new DOMParser().parseFromString(sprite, 'image/svg+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelectorAll('symbol')).toHaveLength(files.length);
    expect(document.getElementById('icon-polkaswap')?.querySelector('path')).not.toBeNull();
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('sizes the outer SVG and fits its artwork into the whole viewport', () => {
    const wrapper = mount(Icon, { props: { icon: 'polkaswap', width: '24px', height: '24px' } });
    expect(wrapper.attributes('width')).toBe('24px');
    expect(wrapper.attributes('height')).toBe('24px');
    expect(wrapper.get('use').attributes('width')).toBe('100%');
    expect(wrapper.get('use').attributes('height')).toBe('100%');
    wrapper.unmount();
  });
});
