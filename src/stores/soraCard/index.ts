import { defineStore } from 'pinia';
import { state } from '@/stores/soraCard/state';
import { getters } from '@/stores/soraCard/getters';
import { actions } from '@/stores/soraCard/actions';

export const useSoraCardStore = defineStore('soraCard', {
  state,
  getters: getters as any, // TODO fix
  actions,
});

export type SoraCardStore = ReturnType<typeof useSoraCardStore>;
