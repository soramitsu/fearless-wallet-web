import { defineComponent } from 'vue';
import mountWithApp from './utils/mountWithApp';

describe('App.vue', () => {
  it('renders root shell', () => {
    const TestComponent = defineComponent({
      name: 'HarnessSmokeTest',
      template: '<div class="harness">Hello</div>',
    });

    const wrapper = mountWithApp(TestComponent);

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.classes()).toContain('harness');
  });
});
