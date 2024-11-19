import { defineStore } from 'pinia';
import { state } from '@/stores/networks/state';
import { getters } from '@/stores/networks/getters';
import { actions } from '@/stores/networks/actions';

export const useNetworksStore = defineStore('networks', {
  state,
  getters,
  actions,
});

export type NetworksStore = ReturnType<typeof useNetworksStore>;
