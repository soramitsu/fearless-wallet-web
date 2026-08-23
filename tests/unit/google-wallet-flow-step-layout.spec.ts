import { mount } from '@vue/test-utils';

import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';

const mountFlow = (countSteps: number, step: number) =>
  mount(FlowStepLayout, {
    props: { countSteps, header: 'Wallet flow', step },
    slots: { default: '<div data-testid="activeStep">active</div>' },
    global: {
      stubs: {
        CircleButton: { template: '<button data-testid="backButton" />' },
        FinishForm: { template: '<div data-testid="finishForm">finished</div>' },
        Loader: { template: '<div data-testid="loader" />' },
      },
    },
  });

describe('Google wallet flow step layout', () => {
  it('renders only actionable progress steps and marks completed steps', () => {
    const wrapper = mountFlow(4, 2);
    const circles = wrapper.findAll('.circle-step');

    expect(circles).toHaveLength(3);
    expect(circles.map((circle) => circle.attributes('data-step'))).toEqual(['1', '2', '3']);
    expect(circles.map((circle) => circle.classes('circle-filled'))).toEqual([true, true, false]);
    expect(wrapper.find('[data-testid="activeStep"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="finishForm"]').exists()).toBe(false);
  });

  it('shows the finish view without a phantom fourth progress circle', () => {
    const wrapper = mountFlow(4, 4);

    expect(wrapper.findAll('.circle-step')).toHaveLength(0);
    expect(wrapper.find('[data-testid="activeStep"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="finishForm"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="backButton"]').exists()).toBe(false);
  });

  it('fails closed for an out-of-range step without allocating progress or claiming completion', () => {
    const wrapper = mountFlow(4, 5);

    expect(wrapper.findAll('.circle-step')).toHaveLength(0);
    expect(wrapper.find('[data-testid="finishForm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="backButton"]').exists()).toBe(false);
  });
});
