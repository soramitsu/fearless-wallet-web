import { mount } from '@vue/test-utils';
import RoundActions from '@/screens/portfolio/RoundActions.vue';

const actions = [
  { id: 'send', icon: 'send', label: 'Send', aria: 'Send a token', testId: 'heroSend' },
  { id: 'receive', icon: 'receive', label: 'Receive', testId: 'heroReceive' },
  { id: 'swap', icon: 'polkaswap', label: 'Swap', testId: 'heroSwap', disabled: true },
];

describe('the round actions of the wallet home and a token page', () => {
  it('names each action, with its word under the icon, and says which was pressed', async () => {
    const wrapper = mount(RoundActions, { props: { actions }, global: { stubs: { Icon: true } } });
    const buttons = wrapper.findAll('button');

    expect(buttons.map((button) => button.attributes('data-testid'))).toEqual(['heroSend', 'heroReceive', 'heroSwap']);
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(['Send a token', 'Receive', 'Swap']);
    expect(buttons.map((button) => button.get('.round-action-label').text())).toEqual(['Send', 'Receive', 'Swap']);
    // The icon is decoration: the label names the action.
    expect(buttons[0].get('.round-action-disc').attributes('aria-hidden')).toBe('true');

    await buttons[1].trigger('click');
    await buttons[0].trigger('click');

    expect(wrapper.emitted('action')).toEqual([['receive'], ['send']]);
  });

  it('keeps an action it cannot take on screen, disabled', async () => {
    const wrapper = mount(RoundActions, { props: { actions }, global: { stubs: { Icon: true } } });
    const swap = wrapper.get('[data-testid="heroSwap"]');

    expect(swap.attributes('disabled')).toBeDefined();
    await swap.trigger('click');
    expect(wrapper.emitted('action')).toBeUndefined();
  });
});
