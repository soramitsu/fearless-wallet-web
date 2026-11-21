import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MirrorLoader from '@/components/MirrorLoader.vue';

// Brand kit v4 SPEC "Shikiban" part 4: three comets on the mirror's rim, or the rim filling to a known share.
describe('the loader', () => {
  it('runs three comets on the mirror\'s rim when the amount is unknown', () => {
    const wrapper = mount(MirrorLoader);

    expect(wrapper.findAll('.comet')).toHaveLength(3);
    expect(wrapper.find('.fill').exists()).toBe(false);
    expect(wrapper.attributes('data-progress')).toBeUndefined();
    // The three heads start a third of a turn apart.
    const starts = wrapper.findAll('.comet').map((comet) => Number((comet.find('path:last-child').element as SVGPathElement).style.getPropertyValue('--from')));
    expect(starts[0] - starts[1]).toBeCloseTo(1 / 3, 5);
    expect(starts[1] - starts[2]).toBeCloseTo(1 / 3, 5);
  });

  it('fills the rim clockwise to a known share instead, and never past the whole', () => {
    const wrapper = mount(MirrorLoader, { props: { progress: 0.4 } });

    expect(wrapper.findAll('.comet')).toHaveLength(0);
    expect(wrapper.attributes('data-progress')).toBe('0.4');
    expect(wrapper.find('.fill').attributes('style')).toContain('stroke-dasharray: 0.4 1');
    expect(mount(MirrorLoader, { props: { progress: 3 } }).attributes('data-progress')).toBe('1');
  });

  it('takes the text colour around it inside a control', () => {
    expect(mount(MirrorLoader, { props: { tone: 'current', size: 21 } }).classes()).toContain('mirror-loader--current');
  });
});
