import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, reactive, ref } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import SwapForm from '@/screens/polkaswap/swap/SwapForm.vue';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID, SORA_VAL_ASSET_ID } from '@/consts/sora';
import { MarketType } from '@/interfaces';
const boundary = vi.hoisted(() => ({ accounts: null as any, networks: null as any, extension: null as any, quote: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => boundary.extension }));
vi.mock('@/extension/messaging', () => ({ checkSwap: boundary.quote }));
vi.mock('@/screens/polkaswap/swap/SwapPreview.vue', () => ({ default: { name: 'SwapPreview', template: '<div />' } }));
vi.mock('@/screens/polkaswap/PolkaswapAlert.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/polkaswap/swap/SwapInfo.vue', () => ({ default: { name: 'SwapInfo', template: '<div />' } }));
vi.mock('@/screens/polkaswap/PolkaswapSettings.vue', () => ({ default: { name: 'PolkaswapSettings', template: '<div />' } }));
vi.mock('@/screens/polkaswap/PolkaswapSettingsHeader.vue', () => ({ default: { name: 'PolkaswapSettingsHeader', template: '<div />' } }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { name: 'ConfirmationPasswordPopup', template: '<div />' } }));
vi.mock('@/screens/polkaswap/swap/Disclaimer.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/pools/PoolsBanner.vue', () => ({ default: { template: '<div />' } }));
const wrappers: VueWrapper[] = [];
const balance = (groupId: string, symbol: string, transferable: string) => ({ groupId, symbol, priceId: groupId, relayChain: SORA_NETWORK_NAME, icon: '/asset.svg', tokenName: symbol, balances: [{ id: groupId, name: SORA_NETWORK_NAME, symbol, transferable, total: transferable, precision: 18, isUtility: symbol === 'xor', existentialDeposit: '0' }] });
const quote = (amountA = '1', amountB = '2') => ({ amountA, amountB, AToB: '2', BToA: '0.5', minMaxValue: '1.99', route: 'XOR → VAL', swapOptions: { amountA, amountB, assetAId: SORA_XOR_ASSET_ID, assetBId: SORA_VAL_ASSET_ID } });
const deferred = () => { let resolve!: (value: ReturnType<typeof quote>) => void; let reject!: (error: Error) => void; const promise = new Promise<ReturnType<typeof quote>>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => {
  vi.useFakeTimers(); boundary.quote.mockReset().mockResolvedValue(quote());
  boundary.accounts = reactive({ accounts: [{ address: 'alice' }], selectedWallet: { address: 'alice' }, fiatSymbol: '$', showPolkaswapAlert: false, balances: [balance(SORA_XOR_ASSET_ID, 'xor', '10'), balance(SORA_VAL_ASSET_ID, 'val', '20')] });
  boundary.networks = reactive({ allNetworks: [{ name: SORA_NETWORK_NAME, active: true, disabled: false, networkStatus: NETWORK_STATUS.CONNECTED }], soraFees: { Swap: '0.01' }, getAssetPrice: () => ({ price: 2 }) });
  boundary.extension = reactive({ features: { actions: { polkaswap: true } } });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllTimers(); vi.useRealTimers(); });
function form(params: Record<string, string> = {}, cached = false) {
  const back = vi.fn();
  const active = ref(true);
  const component = cached ? defineComponent({
    setup: () => () => h(KeepAlive, null, { default: () => active.value ? h(SwapForm) : h('div') }),
  }) : SwapForm;
  const root = shallowMount(component, { global: { renderStubDefaultSlot: true,
    mocks: { $t: (key: string) => key, $n: (value: number) => String(value), $route: { params, query: {} }, $router: { back } },
    stubs: { SwapForm: false, KeepAlive: false, Icon: true, AboveForm: { template: '<div><slot name="header"/><slot /></div>' }, Scroll: { template: '<div><slot /></div>' }, FButton: { props: ['disabled', 'text'], template: '<button :disabled="disabled">{{ text }}</button>' }, SelectInput: { name: 'SelectInput', inheritAttrs: false, props: ['amount', 'asset', 'totalAmount'], template: '<input :value="amount" @input="$emit(\'update:amount\', $event.target.value)" />' }, SelectPopup: { name: 'SelectPopup', props: ['options'], template: '<div />' } },
  } });
  const wrapper = cached ? root.getComponent(SwapForm) : root;
  wrappers.push(root);
  return { wrapper, vm: wrapper.vm as any, back, active };
}
async function ready(cached = false) { const context = form({}, cached); await context.wrapper.setData({ receiveAssetId: SORA_VAL_ASSET_ID }); return context; }

describe('swap form quoting and confirmation', () => {
  it('quotes a user-entered source amount, previews it and requires password confirmation', async () => {
    const { wrapper, vm } = await ready();
    expect(wrapper.get('[data-testid="proceed"]').attributes('disabled')).toBeDefined();
    await wrapper.findAll('input')[0].setValue('1'); await flushPromises();
    expect(boundary.quote).toHaveBeenCalledWith(expect.objectContaining({ amountA: '1', assetAId: SORA_XOR_ASSET_ID, assetBId: SORA_VAL_ASSET_ID, isExchangeB: false }));
    expect(wrapper.findAll('input')[1].element.value).toBe('2');
    expect(wrapper.get('[data-testid="AtoBprice"]').text()).toBe('2 VAL');
    expect(wrapper.get('[data-testid="BtoAprice"]').text()).toBe('0.5 XOR');
    expect(wrapper.get('[data-testid="proceed"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="proceed"]').trigger('click');
    expect(vm.step).toBe(2);
    await wrapper.get('[data-testid="proceed"]').trigger('click');
    expect(vm.showConfirmationPasswordPopup).toBe(true);
    expect(vm.tx.amountB).toBe('2');
    vm.confirmationPasswordPopupClose(true); await flushPromises();
    expect(vm.step).toBe(1); expect(vm.sendAmount).toBe(''); expect(vm.receiveAmount).toBe('');
    const count = boundary.quote.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(boundary.quote).toHaveBeenCalledTimes(count);
    expect(vm.swapInterval).toBeUndefined();
  });
  it('quotes an exact receive amount and reverses the pair while preserving that amount', async () => {
    const { wrapper, vm } = await ready();
    boundary.quote.mockResolvedValue(quote('1.5', '3'));
    await wrapper.findAll('input')[1].setValue('3'); await flushPromises();
    expect(vm.isExchangeB).toBe(true); expect(vm.sendAmount).toBe('1.5');
    expect(boundary.quote).toHaveBeenLastCalledWith(expect.objectContaining({ isExchangeB: true, amountB: '3' }));
    await wrapper.get('[data-testid="swapAssets"]').trigger('click'); await flushPromises();
    expect(vm.sendAssetId).toBe(SORA_VAL_ASSET_ID); expect(vm.receiveAssetId).toBe(SORA_XOR_ASSET_ID);
    expect(vm.isExchangeB).toBe(false); expect(vm.sendAmount).toBe('3');
  });
  it('uses transferable balance minus the fee for Max', async () => {
    const { vm } = await ready(); vm.setMax(); await flushPromises();
    expect(vm.sendAmount).toBe('9.99');
    expect(boundary.quote).toHaveBeenLastCalledWith(expect.objectContaining({ amountA: '9.99' }));
  });
  it('filters asset choices, excludes the opposite asset, and clears filtering after selection', async () => {
    const { vm } = await ready();
    vm.toggleSelectAssetPopupVisibility('receive'); vm.handlerFilter('vAl');
    expect(vm.optionsCurrency.map((option: any) => option.value)).toEqual([SORA_VAL_ASSET_ID]);
    expect(vm.top).toBe(248); expect(vm.selectPopupValue).toBe(SORA_VAL_ASSET_ID);
    vm.toggleSelectedAsset(SORA_VAL_ASSET_ID);
    expect(vm.showSelectPopup).toBe(false); expect(vm.filterValue).toBe('');
    vm.toggleSelectAssetPopupVisibility('send');
    expect(vm.top).toBe(145); expect(vm.optionsCurrency.map((option: any) => option.value)).toEqual([SORA_XOR_ASSET_ID]);
    vm.toggleSelectAssetPopupVisibility(''); expect(vm.showSelectPopup).toBe(false);
  });
  it('edits, cancels, saves and resets temporary swap settings', async () => {
    const { vm } = await ready();
    vm.toggleSettingsVisibility(); vm.updateSlippage(2); vm.updateMarketType(MarketType.SMART);
    expect(vm.header).toBe('assets.swapSettings'); expect(vm.widthButton).toBe('49%'); expect(vm.buttonPreviewDisabled).toBe(false);
    vm.closeForm(); expect(vm.slippage).toBe(0.5);
    vm.toggleSettingsVisibility(); vm.updateSlippage(3); await vm.proceed();
    expect(vm.slippage).toBe(3); expect(vm.showSettings).toBe(false);
    vm.toggleSettingsVisibility(); vm.resetSettings(); await flushPromises();
    expect(vm.slippage).toBe(0.5); expect(vm.marketType).toBe(MarketType.SMART);
  });
  it.each(['isExternal', 'isInjected', 'isHardware'])('blocks confirmation for a wallet marked %s', async flag => {
    const { wrapper, vm } = await ready(); await vm.updateSendAmount('1'); await flushPromises();
    boundary.accounts.accounts[0][flag] = true; await flushPromises();
    expect(wrapper.get('[data-testid="polkaswapCapability"]').text()).toContain('signer');
    expect(vm.buttonPreviewDisabled).toBe(true); await vm.proceed(); expect(vm.step).toBe(1);
  });
  it('blocks runtime, feature, disclaimer and absent-asset states', async () => {
    const { vm } = await ready();
    boundary.networks.allNetworks[0].disabled = true;
    boundary.extension.features.actions.polkaswap = false;
    boundary.accounts.showPolkaswapAlert = true;
    boundary.accounts.balances = [];
    expect(vm.capabilityReasons).toEqual(['account', 'runtime', 'assets', 'disclaimer', 'disabled']);
    await vm.checkSwap(); expect(boundary.quote).not.toHaveBeenCalled();
  });
  it('initializes fee-recovery routes and backs out through preview before closing', async () => {
    const { vm, back } = form({ assetId: SORA_VAL_ASSET_ID, restPriceXOR: '0.02' });
    expect(vm.sendAssetId).toBe(SORA_VAL_ASSET_ID); expect(vm.receiveAssetId).toBe(SORA_XOR_ASSET_ID); expect(vm.receiveAmount).toBe('0.02'); expect(vm.isExchangeB).toBe(true);
    vm.step = 2; vm.back(); expect(vm.step).toBe(1); expect(back).not.toHaveBeenCalled();
    vm.back(); expect(back).toHaveBeenCalledTimes(1);
  });
  it('ignores an older quote that resolves after the current amount', async () => {
    const { vm } = await ready(); const old = deferred(), latest = deferred();
    boundary.quote.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    vm.updateSendAmount('1'); vm.updateSendAmount('4');
    latest.resolve(quote('4', '8')); await flushPromises(); old.resolve(quote('1', '2')); await flushPromises();
    expect(vm.sendAmount).toBe('4'); expect(vm.receiveAmount).toBe('8'); expect(vm.tx.amountA).toBe('4');
  });
  it('cancels quoting and invalidates pending responses when the amount is cleared', async () => {
    const { vm } = await ready(); const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    vm.updateSendAmount('1'); vm.updateSendAmount('');
    pending.resolve(quote()); await flushPromises();
    expect(vm.receiveAmount).toBe(''); expect(vi.getTimerCount()).toBe(0);
    expect(vm.buttonPreviewDisabled).toBe(true);
  });
  it('blocks confirmation while a replacement quote is pending, handles failure, and recovers', async () => {
    const { vm } = await ready(); await vm.updateSendAmount('1');
    const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    const updating = vm.updateSendAmount('3');
    expect(vm.buttonPreviewDisabled).toBe(true); await vm.proceed(); expect(vm.step).toBe(1);
    pending.reject(new Error('RPC unavailable')); await updating;
    expect(vm.buttonText).toBe('common.estimateFeeError'); expect(vm.receiveAmount).toBe('');
    expect(vm.buttonPreviewDisabled).toBe(true); expect(vm.tx).toEqual({});
    await vm.updateSendAmount('2');
    expect(vm.quoteReady).toBe(true); expect(vm.buttonPreviewDisabled).toBe(false);
  });
  it('refreshes quotes periodically but never replaces the amount being reviewed', async () => {
    const { vm } = await ready(); await vm.updateSendAmount('1');
    await vi.advanceTimersByTimeAsync(10_000); expect(boundary.quote).toHaveBeenCalledTimes(2);
    await vm.proceed(); expect(vm.step).toBe(2);
    const approved = vm.tx;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(boundary.quote).toHaveBeenCalledTimes(2); expect(vm.tx).toBe(approved);
    vm.back(); await flushPromises();
    expect(boundary.quote).toHaveBeenCalledTimes(3);
  });
  it('invalidates the old account quote and closes confirmation when the wallet changes', async () => {
    const { vm } = await ready(); const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    vm.updateSendAmount('1'); boundary.accounts.selectedWallet.address = 'bob'; await flushPromises();
    pending.resolve(quote()); await flushPromises();
    expect(vm.receiveAmount).toBe(''); expect(vm.quoteReady).toBe(false); expect(vm.step).toBe(1);
    expect(vm.showConfirmationPasswordPopup).toBe(false); expect(vm.swapInterval).toBeUndefined();
  });
  it('refreshes the retained amount when returning to the cached swap screen', async () => {
    const { vm, active } = await ready(true); await vm.updateSendAmount('1');
    active.value = false; await flushPromises();
    const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    active.value = true; await flushPromises();
    expect(vm.sendAmount).toBe('1'); expect(boundary.quote).toHaveBeenCalledTimes(2);
    expect(vm.quotePending).toBe(true); expect(vm.buttonPreviewDisabled).toBe(true);
    pending.resolve(quote('1', '3')); await flushPromises();
    expect(vm.receiveAmount).toBe('3'); expect(vm.quoteReady).toBe(true);
    expect(vm.buttonPreviewDisabled).toBe(false); expect(vi.getTimerCount()).toBe(1);
  });
  it('requires a fresh preview after the network reconnects during confirmation', async () => {
    const { vm } = await ready(); await vm.updateSendAmount('1');
    await vm.proceed(); await vm.proceed();
    boundary.networks.allNetworks[0].networkStatus = NETWORK_STATUS.DISCONNECTED;
    await flushPromises();
    expect(vm.showConfirmationPasswordPopup).toBe(false); expect(vm.step).toBe(1);
    const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    boundary.networks.allNetworks[0].networkStatus = NETWORK_STATUS.CONNECTED;
    await flushPromises();
    expect(boundary.quote).toHaveBeenCalledTimes(2); expect(vm.quotePending).toBe(true);
    expect(vm.buttonPreviewDisabled).toBe(true);
    pending.resolve(quote('1', '3')); await flushPromises();
    expect(vm.step).toBe(1); expect(vm.receiveAmount).toBe('3');
    expect(vm.showConfirmationPasswordPopup).toBe(false);
    await vm.proceed(); expect(vm.step).toBe(2);
  });
  it('waits for activation before restarting quotes after a background reconnect', async () => {
    const { vm, active } = await ready(true); await vm.updateSendAmount('1');
    active.value = false; await flushPromises();
    boundary.networks.allNetworks[0].networkStatus = NETWORK_STATUS.DISCONNECTED;
    await flushPromises();
    boundary.networks.allNetworks[0].networkStatus = NETWORK_STATUS.CONNECTED;
    await flushPromises();
    expect(boundary.quote).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    active.value = true; await flushPromises();
    expect(boundary.quote).toHaveBeenCalledTimes(2); expect(vm.quoteReady).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('releases refresh timers and prevents late state changes on unmount', async () => {
    const { wrapper, vm } = await ready(); const pending = deferred(); boundary.quote.mockReturnValueOnce(pending.promise);
    vm.updateSendAmount('1'); wrapper.unmount(); pending.resolve(quote()); await flushPromises();
    expect(vi.getTimerCount()).toBe(0); expect(vm.receiveAmount).toBe('');
  });
});
