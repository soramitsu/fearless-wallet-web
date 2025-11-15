# Component Test Harness

We now have a shared helper for mounting Vue components inside unit specs. It
bootstraps the same plugins as the production app (Pinia, Soramitsu UI, i18n)
and stubs the router primitives so tests can focus on behaviour.

```ts
import { defineComponent } from 'vue';
import mountWithApp from '@/../tests/unit/utils/mountWithApp';

describe('MyComponent', () => {
  it('renders', () => {
    const wrapper = mountWithApp(MyComponent, {
      global: {
        stubs: { Transition: false },
      },
    });

    expect(wrapper.text()).toContain('Hello');
  });
});
```

The helper lives at `tests/unit/utils/mountWithApp.ts`. Feel free to pass a
pre-configured Pinia instance via the optional `{ pinia }` option if a test
needs store state set up ahead of time.

Because the helper already registers the Soramitsu UI plugin, there is no need
for individual specs to reach into `installSoramitsuUI` directly. This keeps our
component tests consistent with the app bootstrap flow.
