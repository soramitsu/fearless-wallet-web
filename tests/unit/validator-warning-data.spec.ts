import { describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import type { ValidatorInfoFull } from '@/sora/types';
import { recommendedValidatorAddresses } from '@/helpers/staking';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';

vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$' }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getAssetPrice: () => ({ price: 1 }) }) }));
const validator = (address: string, extra = {}) => ({
  address, name: address, description: '', status: 'active', commission: '0', rewardPoints: 1,
  nominators: [], identity: { info: { display: address } }, identityKey: address, isSlashed: false,
  apy: '10', isOversubscribed: false, isKnownGood: true, stake: { total: '1', own: '1' }, ...extra,
}) as ValidatorInfoFull;
const props = { stakingNetwork: { maxNominatorRewardedPerValidator: 10 }, stakingCurrency: { symbol: 'xor' } };

describe('validator safety data', () => {
  it('recommends only confirmed eligible validators, limited by verified on-chain identity', () => {
    const candidates = [validator('low', { apy: '2', identityKey: 'operator' }),
      validator('high', { apy: '20', identityKey: 'operator' }), validator('other'),
      validator('slashed', { isSlashed: true }), validator('unknown', { isSlashed: undefined }),
      validator('blocked', { blocked: true }), validator('unverified', { isKnownGood: false }),
      validator('oversubscribed', { isOversubscribed: true }), validator('no-identity', { identityKey: undefined }),
      validator('invalid-apy', { apy: 'NaN' })];
    expect([...recommendedValidatorAddresses(candidates, 5)]).toEqual(['high', 'other']);
    expect([...recommendedValidatorAddresses(candidates, 1)]).toEqual(['high']);
    expect(recommendedValidatorAddresses(candidates, 0).size).toBe(0);
    expect(recommendedValidatorAddresses(candidates, NaN).size).toBe(0);
  });

  it('renders a slash warning even for an inactive validator and does not invent one for unknown data', async () => {
    const wrapper = shallowMount(ValidatorInfo, { props: { ...props, validator: validator('bad', { status: 'inactive', isSlashed: true }) },
      global: { mocks: { $t: (key: string) => key, $n: (value: number) => String(value) } } });
    expect(wrapper.vm.showSlashedWarning).toBe(true);
    await wrapper.setProps({ validator: validator('unknown', { isSlashed: undefined }) });
    expect(wrapper.vm.showSlashedWarning).toBe(false);
    wrapper.unmount();
  });

  it('excludes unknown slashing evidence from the Not slashed filter', () => {
    const wrapper = shallowMount(SelectValidator, { props: { ...props, step: 5, selectedValidator: null,
      validators: [validator('safe'), validator('bad', { isSlashed: true }), validator('unknown', { isSlashed: undefined })], notSlashed: true },
      global: { mocks: { $t: (key: string) => key } } });
    expect(wrapper.vm.filteredValidatorsBySettings.map((entry: { address: string }) => entry.address)).toEqual(['safe']);
    wrapper.unmount();
  });
});
