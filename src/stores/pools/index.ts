import { defineStore } from 'pinia';
import { state } from '@/stores/pools/state';
import { getters } from '@/stores/pools/getters';
import { actions } from '@/stores/pools/actions';

export const usePoolsStore = defineStore('pools', {
  state,
  getters,
  actions,
});

export type PoolStore = ReturnType<typeof usePoolsStore>;
