import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import MainStakingForm from '@/screens/staking/myStake/stakingForms/MainStakingForm.vue';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';
const boundary = vi.hoisted(() => ({ accounts: null as any, networks: null as any, staking: null as any, controller: vi.fn(), balance: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/stores/staking', () => ({ useStakingStore: () => boundary.staking }));
vi.mock('@/extension/messaging', () => ({ checkController: boundary.controller, fetchBalance: boundary.balance }));
vi.mock('@/util/BaseApi', () => ({ default: { validateAddress: (address: string) => address.startsWith('valid-'), formatAddress: ({ address }: { address: string }) => address } }));
vi.mock('@/helpers', async original => ({ ...await original<any>(), getClipboard: boundary.clipboard }));
vi.mock('@/screens/staking/myStake/stakingForms/WithdrawUnbonded.vue', () => ({ default: { name: 'WithdrawUnbonded', template: '<div><slot /></div>' } }));
vi.mock('@/screens/staking/myStake/stakingForms/Unbond.vue', () => ({ default: { name: 'Unbond', template: '<div><slot /></div>' } }));
vi.mock('@/screens/staking/myStake/stakingForms/Rebond.vue', () => ({ default: { name: 'Rebond', template: '<div><slot /></div>' } }));
vi.mock('@/screens/staking/myStake/stakingForms/BondExtra.vue', () => ({ default: { name: 'BondExtra', template: '<div><slot /></div>' } }));
vi.mock('@/screens/staking/myStake/stakingForms/ControllerAccount.vue', () => ({ default: { name: 'ControllerAccount', template: '<div><slot /></div>' } }));
vi.mock('@/screens/staking/myStake/stakingForms/Payee.vue', () => ({ default: { name: 'Payee', template: '<div><slot /></div>' } }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/EditAddressBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/HistoryBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/main/WalletInfo.vue', () => ({ default: { template: '<div />' } }));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  boundary.controller.mockReset().mockResolvedValue(true); boundary.balance.mockReset().mockResolvedValue([{ balance: '4' }]); boundary.clipboard.mockReturnValue('valid-clipboard');
  boundary.accounts = reactive({ selectedWallet: { name: 'Alice', address: 'alice' }, acountsEcosystem: [], allAcountsEcosystem: [{ name: 'Bob', address: 'valid-bob' }] });
  boundary.networks = reactive({ getAssetPrice: () => ({ price: 2 }), soraFees: { StakingBondExtra: '0.1', StakingRebond: '0.2', StakingUnbond: '0.3', StakingSetController: '0.4', StakingWithdrawUnbonded: '0.5', StakingSetPayee: '0.6' } });
  boundary.staking = { getMyStakingInfo: vi.fn().mockResolvedValue(undefined) };
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
async function form(type = 'bondExtra', network: Record<string, any> = {}) {
  const currency = { groupId: SORA_XOR_ASSET_ID, symbol: 'xor', priceId: 'xor', balances: [{ name: SORA_NETWORK_NAME, transferable: '10', precision: 18, isUtility: true, existentialDeposit: '0' }] };
  const stakingNetwork = { network: SORA_NETWORK_NAME, transferableAmount: '10', activeStake: '30', unbond: { sum: '12', unlocking: [{ value: '5' }, { value: '7' }] }, redeemAmount: '8', isController: false, stashAddress: 'stash', ...network };
  const wrapper = shallowMount(MainStakingForm, { props: { type, stakingCurrency: currency, stakingNetwork }, global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key }, stubs: {
    AboveForm: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' }, FInput: true,
    SelectInput: { name: 'SelectInput', props: ['amount', 'readonly'], inheritAttrs: false, template: `<input :value="amount" :readonly="readonly" @input="$emit('update:amount', $event.target.value)" />` },
    FButton: { props: ['disabled', 'text'], template: '<button :disabled="disabled">{{ text }}</button>' }, BadgeButton: true,
  } } });
  wrappers.push(wrapper); await flushPromises(); return { wrapper, vm: wrapper.vm as any, currency };
}
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
describe('staking management form', () => {
  it.each([['bondExtra', '0.1', '9.9'], ['unbond', '0.3', '30'], ['rebond', '0.2', '12'], ['redeem', '0.5', '8']])('respects %s balances, fee and Max semantics', async (type, fee, maximum) => {
    const { wrapper, vm } = await form(type);
    expect(vm.fee).toBe(fee); expect(vm.header).toBe(`staking.${type}`);
    if (type === 'rebond') expect(vm.amount).toBe('7');
    if (type === 'redeem') expect(wrapper.get('input').attributes('readonly')).toBeDefined();
    await vm.setMax(); expect(vm.amount).toBe(maximum);
    expect(vm.amountValue).toBe(String(Number(maximum) * 2));
    expect(vm.confirmBtnDisabled).toBe(false);
    await wrapper.get('[data-testid="confirmBtn"]').trigger('click');
    expect(vm.showConfirmationPasswordPopup).toBe(true);
    expect(vm.tx).toMatchObject({ amount: maximum, from: 'alice', networkName: SORA_NETWORK_NAME });
    vm.confirmationPasswordPopupClose(true); await flushPromises();
    expect(boundary.staking.getMyStakingInfo).toHaveBeenCalledWith({ network: SORA_NETWORK_NAME });
    expect(wrapper.emitted('closeForm')).toHaveLength(1);
  });
  it.each(['', '0', '-1', '11', 'NaN'])('rejects an invalid extra-bond amount %s', async amount => {
    const { vm } = await form(); vm.updateAmount(amount);
    expect(vm.confirmBtnDisabled).toBe(true);
    vm.confirm(); expect(vm.showConfirmationPasswordPopup).toBe(false);
  });
  it('cannot submit until a network fee is available', async () => {
    const { vm } = await form(); vm.updateAmount('1'); boundary.networks.soraFees = undefined;
    expect(vm.fee).toBe(''); expect(vm.confirmBtnDisabled).toBe(true);
  });
  it.each(['setController', 'setPayee'])('edits %s through history, clipboard and local wallets', async type => {
    const { vm, wrapper } = await form(type);
    expect(vm.showAmountInput).toBe(false); expect(vm.btnText).toBe('common.edit');
    await wrapper.get('[data-testid="confirmBtn"]').trigger('click'); expect(vm.step).toBe(2);
    expect(vm.confirmBtnDisabled).toBe(true);
    vm.toggleHistoryBookVisibility(); expect(vm.header).toBe('assets.chooseFromHistory'); expect(vm.showBtn).toBe(false);
    vm.toggleEditBook('valid-new'); expect(vm.header).toBe('assets.addContact'); expect(vm.newAddress).toBe('valid-new');
    vm.handlerBack(); expect(vm.showHistoryBook).toBe(true); vm.handlerBack(); expect(vm.showHistoryBook).toBe(false);
    vm.paste(); await flushPromises(); expect(vm.tx[type === 'setPayee' ? 'payee' : 'controllerAddress']).toBe('valid-clipboard');
    vm.toggleMyWalletsVisibility(); expect(vm.header).toBe('assets.wallets'); vm.setWallet('valid-bob', ''); await flushPromises();
    expect(vm.showMyWallets).toBe(false); expect(vm.tx[type === 'setPayee' ? 'payee' : 'controllerAddress']).toBe('valid-bob');
    expect(vm.confirmBtnDisabled).toBe(false);
    vm.confirm(); expect(vm.showConfirmationPasswordPopup).toBe(true);
    vm.confirmationPasswordPopupClose(false); expect(vm.showConfirmationPasswordPopup).toBe(false); expect(wrapper.emitted('closeForm')).toBeUndefined();
  });
  it('requires fee funds when changing the payee', async () => {
    const { wrapper, vm, currency } = await form('setPayee'); vm.confirm(); vm.setPayoutAddress('valid-payee');
    await wrapper.setProps({ stakingCurrency: { ...currency, balances: [{ ...currency.balances[0], transferable: '0' }] } });
    expect(vm.confirmBtnDisabled).toBe(true);
  });
  it('checks controller suitability before allowing confirmation and ignores stale checks', async () => {
    const { vm } = await form('setController'); vm.confirm();
    const old = deferred<boolean>(), current = deferred<boolean>();
    boundary.controller.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    vm.updateControllerAddress('valid-old'); await flushPromises();
    expect(vm.confirmBtnDisabled).toBe(true);
    vm.updateControllerAddress('valid-current'); await flushPromises(); current.resolve(false); await flushPromises(); old.resolve(true); await flushPromises();
    expect(vm.isValidController).toBe(false); expect(vm.confirmBtnDisabled).toBe(true);
  });
  it('handles controller lookup rejection without allowing submission', async () => {
    const { vm } = await form('setController'); vm.confirm();
    boundary.controller.mockRejectedValueOnce(new Error('offline'));
    vm.updateControllerAddress('valid-unavailable'); await flushPromises();
    expect(vm.isValidController).toBe(false); expect(vm.confirmBtnDisabled).toBe(true);
  });
  it('shows an empty rebond balance when no unlocking chunks exist', async () => {
    const { vm } = await form('rebond', { unbond: { sum: '0', unlocking: [] } });
    expect(vm.amount).toBe(''); expect(vm.confirmBtnDisabled).toBe(true);
  });
  it('uses the stash balance for controller fee funding and tolerates an empty balance response', async () => {
    const { vm } = await form('unbond', { isController: true });
    expect(boundary.balance).toHaveBeenCalledWith(expect.objectContaining({ address: 'stash', networks: [SORA_NETWORK_NAME] }));
    expect(vm.stashBalance).toBe('4'); vm.updateAmount('1'); expect(vm.confirmBtnDisabled).toBe(false);
    boundary.balance.mockResolvedValueOnce([]);
    const empty = await form('unbond', { isController: true }); empty.vm.updateAmount('1');
    expect(empty.vm.stashBalance).toBe('0'); expect(empty.vm.confirmBtnDisabled).toBe(true);
  });
  it('still closes after a successful operation when refreshing details fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { wrapper, vm } = await form(); boundary.staking.getMyStakingInfo.mockRejectedValueOnce(new Error('offline'));
    vm.confirmationPasswordPopupClose(true); await flushPromises();
    expect(wrapper.emitted('closeForm')).toHaveLength(1); expect(warn).toHaveBeenCalled();
  });
});
