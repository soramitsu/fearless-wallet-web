import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ balances: [], fiatSymbol: '$' }) }));

import SelectInput from '@/components/SelectInput.vue';
import { formatAmountInput, readAmountInput } from '@/helpers/amountInput';

const global = {
  mocks: { $t: (key: string) => key, $n: (n: number) => String(n) },
  stubs: {
    Icon: true,
    ExternalLogo: true,
    Rotate: { template: '<span><slot /></span>' },
    FCorners: { template: '<div><slot /></div>' },
  },
};

// Holds the amount the way the Send, Swap, Pool and Staking forms do: SelectInput emits, the form stores the value
// and passes it back. Vue then rewrites the focused input with the formatted text, as in the popup.
const Host = defineComponent({
  props: { initial: { type: String, default: '' }, showOriginValue: { type: Boolean, default: false } },
  data() {
    return { amount: this.initial, updates: [] as string[] };
  },
  render() {
    return h(SelectInput, {
      text: 'assets.amount',
      asset: 'dot',
      value: '0',
      totalAmount: 0,
      isRotate: false,
      amount: this.amount,
      showOriginValue: this.showOriginValue,
      'onUpdate:amount': (value: string) => {
        this.amount = value;
        this.updates.push(value);
      },
    });
  },
});

type HostWrapper = VueWrapper<InstanceType<typeof Host>>;

const mountHost = async (props: { initial?: string; showOriginValue?: boolean } = {}): Promise<HostWrapper> => {
  const wrapper = mount(Host, { props, global, attachTo: document.body }) as HostWrapper;
  await flushPromises();

  return wrapper;
};

const field = (wrapper: HostWrapper) => wrapper.get<HTMLInputElement>('input[data-testid="amountInternal"]');

/** One key at a time at the end of the field, reading back what the field shows after each re-render. */
const type = async (wrapper: HostWrapper, keys: string) => {
  const input = field(wrapper);

  input.element.focus();
  for (const key of keys) {
    await input.setValue(`${input.element.value}${key}`);
    await flushPromises();
  }
};

const replaceWith = async (wrapper: HostWrapper, text: string) => {
  await field(wrapper).setValue(text);
  await flushPromises();
};

describe('typing an amount', () => {
  it.each([
    ['50', '50', '50'],
    ['1250', '1,250', '1250'],
    ['0.5', '0.5', '0.5'],
    ['2.5', '2.5', '2.5'],
    ['1250.75', '1,250.75', '1250.75'],
    ['1000000', '1,000,000', '1000000'],
    ['0.000001', '0.000001', '0.000001'],
  ])('keeps %s as typed: the field shows %s and the amount is %s', async (keys, shown, amount) => {
    const wrapper = await mountHost();

    await type(wrapper, keys);

    expect(field(wrapper).element.value).toBe(shown);
    expect(wrapper.vm.amount).toBe(amount);
    wrapper.unmount();
  });

  it('starts a decimal typed as a point with its zero', async () => {
    const wrapper = await mountHost();

    await type(wrapper, '.');
    expect(field(wrapper).element.value).toBe('0.');
    await type(wrapper, '5');
    expect(field(wrapper).element.value).toBe('0.5');
    expect(wrapper.vm.amount).toBe('0.5');
    wrapper.unmount();
  });

  it('removes the last digit from a grouped amount', async () => {
    const wrapper = await mountHost();

    await type(wrapper, '1250');
    await replaceWith(wrapper, '1,25');

    expect(wrapper.vm.amount).toBe('125');
    expect(field(wrapper).element.value).toBe('125');
    wrapper.unmount();
  });

  it('drops a trailing point or zero fraction when the field loses focus', async () => {
    const wrapper = await mountHost();

    await type(wrapper, '5.000');
    expect(wrapper.vm.amount).toBe('5.000');
    await field(wrapper).trigger('blur');
    await flushPromises();
    expect(wrapper.vm.amount).toBe('5');
    expect(field(wrapper).element.value).toBe('5');
    wrapper.unmount();
  });
});

describe('pasting an amount', () => {
  it('reads grouped text as its plain amount', async () => {
    const wrapper = await mountHost();

    await replaceWith(wrapper, ' 1,234,567.89 ');

    expect(wrapper.vm.amount).toBe('1234567.89');
    expect(field(wrapper).element.value).toBe('1,234,567.89');
    wrapper.unmount();
  });

  it.each(['abc', '1e5', '-5', '0x10', '1.2.3', '1.234,56'])(
    'refuses %s and shows the kept amount again, without an update that would clear Max',
    async (text) => {
      const wrapper = await mountHost({ initial: '12' });

      await replaceWith(wrapper, text);

      expect(wrapper.vm.amount).toBe('12');
      expect(wrapper.vm.updates).toEqual([]);
      expect(field(wrapper).element.value).toBe('12');
      wrapper.unmount();
    }
  );
});

describe('amounts a form sets (Max, a quote)', () => {
  it.each([
    ['0.001', '0.001'],
    ['12', '12'],
    ['12.0', '12.0'],
    ['1234567.123456789123', '1,234,567.123456789123'],
  ])('shows %s as %s', async (amount, shown) => {
    const wrapper = await mountHost({ initial: amount });

    expect(field(wrapper).element.value).toBe(shown);
    wrapper.unmount();
  });

  it('shows the plain amount where the form asks for it', async () => {
    const wrapper = await mountHost({ initial: '1234.5', showOriginValue: true });

    expect(field(wrapper).element.value).toBe('1234.5');
    wrapper.unmount();
  });
});

describe('amount text helpers', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['007', '7'],
    ['00.5', '0.5'],
    ['.', '0.'],
    ['5.', '5.'],
    ['1234', '1,234'],
    ['1234567.0100', '1,234,567.0100'],
  ])('formats %s as %s', (amount, shown) => {
    expect(formatAmountInput(amount)).toBe(shown);
  });

  it('keeps the previous amount for text that is not a plain decimal', () => {
    expect(readAmountInput('1,2,3', '1')).toBe('123');
    expect(readAmountInput('12.5', '1')).toBe('12.5');
    expect(readAmountInput('', '5')).toBe('');
    expect(readAmountInput('1,000.5,0', '7')).toBe('7');
    expect(readAmountInput('NaN', '7')).toBe('7');
  });
});
