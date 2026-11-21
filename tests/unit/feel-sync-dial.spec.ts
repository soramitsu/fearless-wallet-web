import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SyncDial from '@/components/SyncDial.vue';
import { DIAL } from '@/feel/shikiban';

// Brand kit v4 SPEC "Shikiban" part 2: the dial shows what the wallet knows about its networks, and nothing it does not.
const dial = (props: Record<string, unknown>) => mount(SyncDial, { props: props as never });

describe('the sync dial', () => {
  afterEach(() => delete document.documentElement.dataset.fwEffects);

  it('lights the share of networks that have answered and runs its comet while any are outstanding', () => {
    const wrapper = dial({ kind: 'updating', done: 7, total: 14 });

    expect(wrapper.attributes('data-state')).toBe('syncing');
    expect(wrapper.attributes('data-lit')).toBe('0.5');
    expect(wrapper.findAll('.unlit')).toHaveLength(DIAL.segments);
    expect(wrapper.findAll('.lit')).toHaveLength(4);
    expect(wrapper.find('.comet').exists()).toBe(true);
    expect(wrapper.find('.centre').exists()).toBe(false);
    expect(wrapper.attributes('aria-hidden')).toBe('true');
  });

  it('shows only the comet over an unlit ring when the wallet does not know its numbers', () => {
    const wrapper = dial({ kind: 'updating' });

    expect(wrapper.findAll('.lit')).toHaveLength(0);
    expect(wrapper.find('.comet').exists()).toBe(true);
  });

  it('is whole and still, with its centre, when the wallet is live', () => {
    const wrapper = dial({ kind: 'live', done: 14, total: 14 });

    expect(wrapper.attributes('data-state')).toBe('live');
    expect(wrapper.findAll('.lit')).toHaveLength(DIAL.segments);
    expect(wrapper.findAll('.failed')).toHaveLength(0);
    expect(wrapper.find('.comet').exists()).toBe(false);
    expect(wrapper.find('.centre').exists()).toBe(true);
  });

  it('turns the share that gave up ember, at the end of the ring, and keeps the centre', () => {
    const wrapper = dial({ kind: 'partial', done: 12, failed: 2, total: 16 });

    expect(wrapper.attributes('data-state')).toBe('partial');
    expect(wrapper.attributes('data-failed')).toBe('0.125');
    expect(wrapper.findAll('.failed')).toHaveLength(1);
    expect(wrapper.find('.centre').exists()).toBe(true);
  });

  it('says only "some" with its last segment when a failure has no numbers', () => {
    const wrapper = dial({ kind: 'partial' });

    expect(wrapper.findAll('.failed')).toHaveLength(1);
    expect(wrapper.findAll('.lit')).toHaveLength(DIAL.segments - 1);
  });

  it('is whole without a centre for saved balances, and unlit offline', () => {
    const saved = dial({ kind: 'saved' });
    expect(saved.attributes('data-state')).toBe('saved');
    expect(saved.find('.centre').exists()).toBe(false);

    const offline = dial({ kind: 'offline' });
    expect(offline.findAll('.lit')).toHaveLength(0);
    expect(offline.find('.comet').exists()).toBe(false);
  });

  it('seals once when a sync settles, and not under the Reduced paint', async () => {
    const wrapper = dial({ kind: 'updating', done: 13, total: 14 });
    expect(wrapper.find('[data-testid="syncDialSeal"]').exists()).toBe(false);
    await wrapper.setProps({ kind: 'live', done: 14 });
    expect(wrapper.find('[data-testid="syncDialSeal"]').exists()).toBe(true);

    document.documentElement.dataset.fwEffects = 'reduced';
    const still = dial({ kind: 'updating', done: 13, total: 14 });
    await still.setProps({ kind: 'live', done: 14 });
    expect(still.find('[data-testid="syncDialSeal"]').exists()).toBe(false);
  });
});
