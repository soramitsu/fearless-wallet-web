import { defineStore } from 'pinia';
import { state } from '@/stores/extension/state';
import { getters } from '@/stores/extension/getters';
import { actions } from '@/stores/extension/actions';

export const useExtensionStore = defineStore('extension', {
  state,
  getters,
  actions,
});

export type ExtensionStore = ReturnType<typeof useExtensionStore>;
