import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';
import Bond from '@/screens/staking/Bond.vue';

const boundary = vi.hoisted(() => ({ accounts: null as any, networks: null as any, fee: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/extension/messaging', () => ({ getBondAndNominateNetworkFee: boundary.fee }));
vi.mock('@/util/BaseApi', () => ({ default: { validateAddress: (address: string) => address.startsWith('valid-'), formatAddress: ({ address }: { address: string }) => address } }));
vi.mock('@/helpers', async original => ({ ...await original<any>(), getClipboard: boundary.clipboard }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { name: 'ConfirmationPasswordPopup', template: '<div />' } }));
vi.mock('@/screens/wallet&asset/EditAddressBook.vue', () => ({ default: { name: 'EditAddressBook', template: '<div />' } }));
vi.mock('@/screens/wallet&asset/HistoryBook.vue', () => ({ default: { name: 'HistoryBook', template: '<div />' } }));
vi.mock('@/screens/main/WalletInfo.vue', () => ({ default: { name: 'WalletInfo', template: '<div />' } }));
vi.mock('@/screens/staking/myStake/validators/SelectValidator.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/staking/myStake/validators/FiltersPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/staking/myStake/validators/SelectionValidatorsForm.vue', () => ({ default: { name: 'SelectionValidatorsForm', template: '<div />' } }));
const wrappers: VueWrapper[] = [];
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  boundary.fee.mockReset().mockResolvedValue('0.2'); boundary.clipboard.mockReturnValue('valid-pasted');
  boundary.accounts = reactive({ selectedWallet: { name: 'Alice', address: 'alice' }, fiatSymbol: '$', acountsEcosystem: [{ name: 'Bob', address: 'valid-bob', ethereumAddress: '' }], balances: [{ groupId: SORA_XOR_ASSET_ID, symbol: 'xor', priceId: 'xor', icon: 'xor', color: '#fff', balances: [{ name: SORA_NETWORK_NAME, transferable: '10', precision: 18, isUtility: true, existentialDeposit: '0' }] }] });
  boundary.networks = reactive({ getAssetPrice: () => ({ price: 2 }) });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); });
async function form(overrides = {}) {
  const network = { network: SORA_NETWORK_NAME, minBond: '1', maxNominations: 2, unbondPeriod: 28, validators: [...['a', 'b', 'c'].map((id) => ({ address: `validator-${id}`, name: id.toUpperCase(), apy: '10', identityKey: id, isKnownGood: true, isSlashed: false, isOversubscribed: false }))], ...overrides };
  const wrapper = shallowMount(Bond, { props: { stakingNetwork: network }, global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key, $n: (value: number) => value.toFixed(2) }, stubs: {
    AboveForm: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' }, ContentForm: { template: '<div><slot /></div>' },
    FInput: true, Hint: true, InputWithIcon: true, BadgeButton: true, InfoRow: true, Tooltip: true, Icon: true, AssetHighlightIcon: true,
    SelectInput: { name: 'SelectInput', props: ['amount'], template: `<input :value="amount" @input="$emit('update:amount', $event.target.value)" />` },
    FButton: { props: ['disabled', 'text'], template: '<button :disabled="disabled">{{ text }}</button>' },
  } } });
  wrappers.push(wrapper); await flushPromises(); return { wrapper, vm: wrapper.vm as any };
}
async function amount(wrapper: VueWrapper, value = '2') { await wrapper.get('input').setValue(value); await flushPromises(); }
async function next(wrapper: VueWrapper) { await wrapper.get('[data-testid="confirmBtn"]').trigger('click'); await flushPromises(); }

describe('bond and nominate user flow', () => {
  it('shows runtime era timing only when the chain supplied a duration', async () => {
    const { wrapper, vm } = await form({ eraHours: 12 });
    vm.step = 6;
    await flushPromises();
    expect(wrapper.find('[data-testid="descriptionRowStaked"]').exists()).toBe(true);
    await wrapper.setProps({ stakingNetwork: { ...wrapper.props('stakingNetwork'), eraHours: undefined } });
    expect(wrapper.find('[data-testid="descriptionRowStaked"]').exists()).toBe(false);
  });

  it('renders the staking balance and quotes a worst-case fee before continuing', async () => {
    const { wrapper, vm } = await form();
    expect(vm.header).toBe('staking.bond'); expect(vm.accountName).toBe('Alice');
    expect(vm.textMinHint.localeProps).toEqual({ value: '1', asset: 'XOR' });
    expect(vm.transferableAmount).toBe(10); expect(vm.feeMaxValueString).toBe('$0.40');
    expect(boundary.fee).toHaveBeenCalledWith(expect.objectContaining({ validators: expect.any(Array), networkName: SORA_NETWORK_NAME }));
    await amount(wrapper); expect(vm.amountValue).toBe('4'); expect(vm.confirmBtnDisabled).toBe(false);
    await next(wrapper); expect(vm.step).toBe(2); expect(vm.showBtn).toBe(false); expect(vm.header).toBe('staking.validators');
  });
  it('completes recommended validators through warning, review, and password approval', async () => {
    const { wrapper, vm } = await form(); await amount(wrapper); await next(wrapper);
    vm.openValidatorList(true); await flushPromises();
    expect(vm.step).toBe(3); expect(vm.btnText).toBe('common.iAgree'); expect(vm.selectedValidators).toEqual(['validator-a', 'validator-b']);
    await next(wrapper); expect(vm.step).toBe(4); expect(vm.header).toBe('staking.recommended');
    await next(wrapper); expect(vm.step).toBe(6); expect(vm.header).toBe('common.confirmation');
    expect(vm.amountString).toBe('2 XOR'); expect(vm.amountValueString).toBe('$4.00'); expect(vm.feeValueString).toBe('$0.40'); expect(vm.days).toEqual({ value: 28 });
    expect(vm.tx).toEqual({ amount: '2', from: 'alice', networkName: SORA_NETWORK_NAME, payoutAddress: '', validators: ['validator-a', 'validator-b'] });
    await next(wrapper); expect(vm.showConfirmationPasswordPopup).toBe(true);
    vm.confirmationPasswordPopupClose(false); expect(vm.showConfirmationPasswordPopup).toBe(false); expect(wrapper.emitted('closeBond')).toBeUndefined();
    vm.confirmationPasswordPopupClose(true); expect(wrapper.emitted('closeBond')).toEqual([[null, true]]);
  });
  it('supports custom validators and returns to the correct screen', async () => {
    const { wrapper, vm } = await form(); await amount(wrapper); await next(wrapper); vm.openValidatorList(false); await flushPromises();
    expect(vm.step).toBe(5); expect(vm.confirmBtnDisabled).toBe(true);
    vm.updateSelectedValidators(true, 'validator-c'); await flushPromises();
    expect(vm.selectedValidators).toEqual(['validator-c']);
    vm.openValidatorInfo(vm.validators[2]); vm.handlerBack(); expect(vm.selectedValidator).toBeNull(); expect(vm.step).toBe(5);
    await next(wrapper); expect(vm.step).toBe(6); vm.handlerBack(); expect(vm.step).toBe(5); vm.handlerBack(); expect(vm.step).toBe(2);
    vm.openValidatorList(true); await flushPromises(); vm.confirm(); vm.confirm(); expect(vm.step).toBe(6); vm.handlerBack(); expect(vm.step).toBe(4);
  });
  it('selects payout accounts through history, clipboard and local wallets', async () => {
    const { vm, wrapper } = await form();
    vm.toggleHistoryBookVisibility(); expect(vm.header).toBe('assets.chooseFromHistory'); expect(vm.showBtn).toBe(false);
    vm.toggleEditBook('valid-contact'); expect(vm.header).toBe('assets.addContact'); expect(vm.newAddress).toBe('valid-contact');
    vm.handlerBack(); expect(vm.showHistoryBook).toBe(true); vm.setPayoutAddress('valid-history'); vm.handlerBack();
    expect(vm.showHistoryBook).toBe(false); vm.paste(); expect(vm.payoutAddress).toBe('valid-pasted');
    vm.toggleMyWalletsVisibility(); expect(vm.header).toBe('assets.wallets'); expect(vm.showBackIcon).toBe(true);
    vm.setWallet('valid-bob', ''); expect(vm.showMyWallets).toBe(false); expect(vm.getStatusWallet('valid-bob', '')).toBe(true);
    vm.toggleMyWalletsVisibility(); vm.handlerBack(); expect(vm.showMyWallets).toBe(false);
    vm.setPayoutAddress('invalid'); await amount(wrapper); expect(vm.confirmBtnDisabled).toBe(true);
    vm.setPayoutAddress(); expect(vm.isValidPayoutAddress).toBe(true);
  });
  it('sets Max after reserving network fees and clamps nomination count to available validators', async () => {
    const { vm } = await form({ maxNominations: 10 });
    await vm.setMax(); expect(vm.amount).toBe('9.8'); expect(vm.maxNominations).toBe(3);
    vm.openValidatorList(true); expect(vm.selectedValidators).toHaveLength(3);
  });
  it.each(['', '0', '-1', '0.5', '11', 'NaN', 'Infinity'])('blocks invalid or below-minimum amount %s even via direct confirmation', async value => {
    const { wrapper, vm } = await form(); await amount(wrapper, value);
    expect(vm.confirmBtnDisabled).toBe(true); vm.confirm(); expect(vm.step).toBe(1);
  });
  it('requires an actual fee quote before moving forward', async () => {
    boundary.fee.mockReturnValue(new Promise(() => {}));
    const { wrapper, vm } = await form(); await amount(wrapper); expect(vm.confirmBtnDisabled).toBe(true);
    vm.confirm(); expect(vm.step).toBe(1);
  });
  it('handles a missing utility balance without throwing or permitting bonding', async () => {
    boundary.accounts.balances = [];
    const { vm } = await form(); expect(vm.transferableAmount).toBe(0); expect(vm.btnText).toMatchObject({ text: 'assets.insufficientBalance' });
    await vm.setMax(); expect(vm.amount).toBe(''); expect(vm.confirmBtnDisabled).toBe(true);
  });
  it('does not accept more nominations than the chain limit', async () => {
    const { wrapper, vm } = await form(); await amount(wrapper); vm.openValidatorList(false);
    for (const validator of ['validator-a', 'validator-b', 'validator-c']) vm.updateSelectedValidators(true, validator);
    await flushPromises(); expect(vm.selectedValidators.length).toBeLessThanOrEqual(2);
  });
  it('keeps a newer fee quote when an earlier validator quote resolves late', async () => {
    const { vm } = await form(); const old = deferred<string>(), current = deferred<string>();
    boundary.fee.mockImplementation((tx: { validators: string[] }) => tx.validators.length === 1 ? old.promise : current.promise);
    vm.updateSelectedValidators(true, 'validator-a'); await flushPromises();
    vm.updateSelectedValidators(true, 'validator-b'); await flushPromises();
    current.resolve('0.4'); await flushPromises(); old.resolve('0.3'); await flushPromises();
    expect(vm.fee).toBe('0.4');
  });
  it('invalidates the quote when amount or payout changes', async () => {
    const { wrapper, vm } = await form(); boundary.fee.mockClear();
    await amount(wrapper, '3'); expect(boundary.fee).toHaveBeenCalledWith(expect.objectContaining({ amount: '3' }));
    boundary.fee.mockClear(); vm.setPayoutAddress('valid-payee'); await flushPromises();
    expect(boundary.fee).toHaveBeenCalledWith(expect.objectContaining({ payoutAddress: 'valid-payee' }));
  });
});

describe('bond fee request batching and immediate invalidation', () => {
  const validators = () => Array.from({ length: 100 }, (_, index) => ({
    address: `validator-${index}`, name: `Validator ${index}`, apy: '10', identityKey: `operator-${index}`,
    isKnownGood: true, isSlashed: false, isOversubscribed: false,
  }));
  it('mounts a realistic validator catalogue with one actual and one maximum fee request', async () => {
    const { vm } = await form({ validators: validators(), maxNominations: 16 });
    expect(vm.validators).toHaveLength(100);
    expect(boundary.fee).toHaveBeenCalledTimes(2);
    expect(boundary.fee.mock.calls.map(([tx]) => tx.validators.length).sort((a, b) => a - b)).toEqual([0, 16]);
    expect(vm.feeMax).toBe('0.2');
  });
  it('coalesces recommended selection while blocking confirmation before the new quotes settle', async () => {
    const { vm, wrapper } = await form({ validators: validators(), maxNominations: 16 });
    await amount(wrapper); boundary.fee.mockClear();
    vm.openValidatorList(true);
    expect(vm.selectedValidators).toHaveLength(16);
    expect(vm.fee).toBe(''); expect(vm.feeMax).toBe('');
    expect(vm.confirmBtnDisabled).toBe(true);
    vm.confirm(); expect(vm.step).toBe(3);
    expect(boundary.fee).not.toHaveBeenCalled();
    await flushPromises();
    expect(boundary.fee).toHaveBeenCalledTimes(2);
    for (const [tx] of boundary.fee.mock.calls) expect(tx.validators).toEqual(vm.selectedValidators);
    expect(vm.confirmBtnDisabled).toBe(false);
    boundary.fee.mockClear(); vm.openValidatorList(true); await flushPromises();
    expect(boundary.fee).not.toHaveBeenCalled();
  });
  it('ignores equivalent selection arrays and unrelated validator display metadata', async () => {
    const { vm } = await form({ validators: validators(), maxNominations: 16 });
    boundary.fee.mockClear();
    vm.state['validator-50'].name = 'Updated public display name';
    vm.state['validator-101'] = { ...validators()[0], address: 'validator-101', isSelect: false };
    await flushPromises();
    expect(boundary.fee).not.toHaveBeenCalled();
    expect(vm.feeMax).toBe('0.2');
  });
  it('invalidates a completed old promise before the batched replacement RPC starts', async () => {
    const { vm } = await form();
    const old = deferred<string>(), current = deferred<string>();
    boundary.fee.mockReturnValueOnce(old.promise).mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    vm.updateAmount('3'); await flushPromises();
    old.resolve('0.9');
    vm.updateAmount('4');
    expect(vm.fee).toBe(''); expect(vm.feeMax).toBe('');
    expect(vm.confirmBtnDisabled).toBe(true);
    await flushPromises();
    expect(vm.fee).toBe(''); expect(vm.feeMax).toBe('');
    current.resolve('0.4'); await flushPromises();
    expect(vm.fee).toBe('0.4'); expect(vm.feeMax).toBe('0.4');
  });
  it('does not start queued fee requests after the form unmounts', async () => {
    const { vm, wrapper } = await form(); boundary.fee.mockClear();
    vm.updateAmount('3'); wrapper.unmount(); await flushPromises();
    expect(boundary.fee).not.toHaveBeenCalled();
  });
});
