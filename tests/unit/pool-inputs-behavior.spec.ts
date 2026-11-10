import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InputsForm from '@/screens/pools/InputsForm.vue';
const boundary = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ getAmountPoolValue: boundary.quote }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getAssetPrice: (id: string) => ({ price: id === 'xor' ? 2 : 3 }) }) }));
const wrappers: VueWrapper[] = [];
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { boundary.quote.mockReset().mockImplementation(async ({ amount1, amount2, isExchangeB }) => String(isExchangeB ? +amount2 / 2 : +amount1 * 2)); });
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
function form(type = 'addLiquidity', extra = {}) {
  const poolParams = { network: 'sora', asset1: { id: 'xor', name: 'XOR', priceId: 'xor', reserve: '100', transferableAmount: '10', tokenBalance: '8' }, asset2: { id: 'val', name: 'VAL', priceId: 'val', reserve: '200', transferableAmount: '20', tokenBalance: '16' } };
  const wrapper: VueWrapper<InstanceType<typeof InputsForm>> = shallowMount(InputsForm, { props: { poolParams, extrinsicType: type, amount1: '', amount2: '', isExchangeB: false, fee: '0.1', currency1: { balances: [{ name: 'sora', transferable: '10', isUtility: true, precision: 18 }] }, currency2: { balances: [{ name: 'sora', transferable: '20', isUtility: false, precision: 18 }] },
    'onUpdate:amount1': value => { void wrapper.setProps({ amount1: value }); }, 'onUpdate:amount2': value => { void wrapper.setProps({ amount2: value }); }, 'onUpdate:isExchangeB': value => { void wrapper.setProps({ isExchangeB: value }); }, ...extra,
  }, global: { stubs: { SelectInput: { name: 'SelectInput', props: ['amount', 'asset', 'totalAmount', 'value'], template: `<input :value="amount" @input="$emit('update:amount', $event.target.value)" />` }, Icon: true, EllipseButton: { template: '<button>Max</button>' }, Slider: true } } });
  wrappers.push(wrapper); return { wrapper, vm: wrapper.vm as any, poolParams };
}
async function enter(wrapper: VueWrapper, index: number, value: string) { await wrapper.findAll('input')[index].setValue(value); await flushPromises(); }

describe('liquidity amount inputs', () => {
  it('quotes proportional add-liquidity amounts from either side and displays fiat cost', async () => {
    const { wrapper, vm } = form(); await enter(wrapper, 0, '3');
    expect(wrapper.props('amount2')).toBe('6'); expect(vm.value1.toString()).toBe('6'); expect(vm.value2.toString()).toBe('18'); expect(vm.transferableAmount1).toBe('10');
    await enter(wrapper, 1, '8'); expect(wrapper.props('amount1')).toBe('4'); expect(wrapper.props('isExchangeB')).toBe(true);
    await enter(wrapper, 1, ''); expect(wrapper.props('amount1')).toBe('0'); expect(boundary.quote).not.toHaveBeenCalled();
  });
  it('preserves the other amount when creating a pool with no reserves', async () => {
    const { wrapper, poolParams } = form(); await wrapper.setProps({ poolParams: { ...poolParams, asset1: { ...poolParams.asset1, reserve: '0' }, asset2: { ...poolParams.asset2, reserve: '0' } } });
    await enter(wrapper, 0, '2'); expect(wrapper.props('amount2')).toBe(''); await enter(wrapper, 1, '5'); expect(wrapper.props('amount1')).toBe('2');
  });
  it('reserves the network fee for utility-token Max and uses the full non-utility balance', async () => {
    const { wrapper, vm } = form(); vm.setMax(false); await flushPromises(); expect(wrapper.props('amount1')).toBe('9.9'); expect(wrapper.props('amount2')).toBe('19.8');
    vm.setMax(true); await flushPromises(); expect(wrapper.props('amount2')).toBe('20'); expect(wrapper.props('amount1')).toBe('10');
  });
  it.each([0, 1])('quotes withdrawal input %s and derives the percentage of available liquidity', async index => {
    const { wrapper, vm } = form('removeLiquidity'); await enter(wrapper, index, index ? '8' : '4');
    expect(wrapper.props('amount1')).toBe('4'); expect(wrapper.props('amount2')).toBe('8'); expect(vm.percent).toBe(50);
    expect(boundary.quote).toHaveBeenLastCalledWith(expect.objectContaining({ assetId1: 'xor', assetId2: 'val', networkName: 'sora', isExchangeB: Boolean(index) }));
  });
  it('sets both withdrawal amounts with the slider and recomputes on available-balance changes', async () => {
    const { wrapper, vm, poolParams } = form('removeLiquidity'); vm.updatePercent(25); await flushPromises();
    expect(wrapper.props('amount1')).toBe('2'); expect(wrapper.props('amount2')).toBe('4'); expect(boundary.quote).not.toHaveBeenCalled();
    await wrapper.setProps({ poolParams: { ...poolParams, asset1: { ...poolParams.asset1, tokenBalance: '12' }, asset2: { ...poolParams.asset2, tokenBalance: '24' } } }); await flushPromises();
    expect(wrapper.props('amount1')).toBe('3'); expect(wrapper.props('amount2')).toBe('6');
    vm.setMax(false); await flushPromises(); expect(wrapper.props('amount1')).toBe('12'); expect(vm.percentIsMax).toBe(true);
  });
  it.each([0, 1])('clamps a withdrawal exceeding balance on input %s to Max', async index => {
    const { wrapper, vm } = form('removeLiquidity'); await enter(wrapper, index, '999');
    expect(wrapper.props('amount1')).toBe('8'); expect(wrapper.props('amount2')).toBe('16'); expect(vm.percent).toBe(100);
  });
  it('ignores stale withdrawal quotes after the user edits again', async () => {
    const old = deferred<string>(), current = deferred<string>(); boundary.quote.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { wrapper } = form('removeLiquidity'); await enter(wrapper, 0, '1'); await enter(wrapper, 0, '3');
    current.resolve('6'); await flushPromises(); old.resolve('2'); await flushPromises(); expect(wrapper.props('amount2')).toBe('6');
  });
  it('ignores an outstanding quote when the user moves the percentage slider', async () => {
    const pending = deferred<string>(); boundary.quote.mockReturnValueOnce(pending.promise);
    const { wrapper, vm } = form('removeLiquidity'); await enter(wrapper, 0, '1'); vm.updatePercent(50); await flushPromises();
    pending.resolve('2'); await flushPromises(); expect(wrapper.props('amount1')).toBe('4'); expect(wrapper.props('amount2')).toBe('8');
  });
  it('contains quote failures and clears the derived amount', async () => {
    boundary.quote.mockRejectedValueOnce(new Error('offline'));
    const { wrapper } = form('removeLiquidity'); await enter(wrapper, 0, '1'); expect(wrapper.props('amount2')).toBe('');
  });
  it('keeps zero-liquidity percentages finite', async () => {
    const { wrapper, vm, poolParams } = form('removeLiquidity'); await wrapper.setProps({ poolParams: { ...poolParams, asset1: { ...poolParams.asset1, tokenBalance: '0' }, asset2: { ...poolParams.asset2, tokenBalance: '0' } } });
    await wrapper.setProps({ amount1: '0' }); await flushPromises(); expect(vm.percent).toBe(0); expect(wrapper.props('amount2')).toBe('0');
  });
  it('does not publish an outstanding quote after unmount', async () => {
    const pending = deferred<string>(); boundary.quote.mockReturnValueOnce(pending.promise);
    const { wrapper } = form('removeLiquidity'); await enter(wrapper, 0, '1'); wrapper.unmount(); const count = wrapper.emitted('update:amount2')?.length ?? 0;
    pending.resolve('2'); await flushPromises(); expect(wrapper.emitted('update:amount2')?.length ?? 0).toBe(count);
  });
});
