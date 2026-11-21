// A tooltip can show chain data a stranger wrote (a SORA validator's on-chain identity): it must stay text.
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const tippy = vi.hoisted(() => vi.fn((_target: unknown, _options: Record<string, unknown>) => [{ destroy: vi.fn() }]));
vi.mock('tippy.js', () => ({ default: tippy }));

import Tooltip from '@/components/Tooltip.vue';

describe('Tooltip', () => {
  it('passes its text to tippy as text, never as HTML', () => {
    const identity = '<form action="https://example.com"><input name="phrase"></form><style>*{display:none}</style>';
    const wrapper = mount(Tooltip, {
      props: { text: identity, target: '.validator' },
      global: { mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' } } },
    });

    expect(tippy).toHaveBeenCalledTimes(1);
    const options = tippy.mock.calls[0][1];
    expect(options.allowHTML).toBe(false);
    expect(options.content).toBe(identity);
    wrapper.unmount();
  });
});
