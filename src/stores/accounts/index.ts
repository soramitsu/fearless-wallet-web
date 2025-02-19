import { defineStore } from 'pinia';
import { state } from '@/stores/accounts/state';
import { getters } from '@/stores/accounts/getters';
import { actions } from '@/stores/accounts/actions';

export const useAccountsStore = defineStore('accounts', {
  state,
  getters,
  actions,
});

export type AccountStore = ReturnType<typeof useAccountsStore>;
