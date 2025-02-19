import { defineStore } from 'pinia';
import { state } from '@/stores/staking/state';
import { getters } from '@/stores/staking/getters';
import { actions } from '@/stores/staking/actions';

export const useStakingStore = defineStore('staking', {
  state,
  getters,
  actions,
});

export type StakingStore = ReturnType<typeof useStakingStore>;
