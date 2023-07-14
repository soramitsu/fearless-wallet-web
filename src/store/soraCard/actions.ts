import type { State } from '@/store/soraCard/state';
import type { ActionTree } from 'vuex';
import type { AugmentedSoraCardContext } from './types';
import { initPayWingsAuthSdk, defineUserStatus, getFreeKycAttemptCount, getXorPerEuroRatio } from '@/util/soraCard';
import { MutationTypes } from '@/store/soraCard/mutations';

export enum ActionTypes {
  INIT_AUTH_LOGIN = 'INIT_AUTH_LOGIN',
  GET_USER_STATUS = 'GET_USER_STATUS',
  GET_USER_KYC_ATTEMPT = 'GET_USER_KYC_ATTEMPT',
  GET_XOR_PER_EURO_RATIO = 'GET_XOR_PER_EURO_RATIO',
}

export type Actions = {
  [ActionTypes.INIT_AUTH_LOGIN](store: AugmentedSoraCardContext): Promise<void>;
  [ActionTypes.GET_USER_STATUS](store: AugmentedSoraCardContext): Promise<void>;
  [ActionTypes.GET_USER_KYC_ATTEMPT](store: AugmentedSoraCardContext): Promise<void>;
  [ActionTypes.GET_XOR_PER_EURO_RATIO](store: AugmentedSoraCardContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.INIT_AUTH_LOGIN]({ commit }) {
    const setAuthLogin = (login: any) => commit(MutationTypes.SET_AUTH_LOGIN, login);

    await initPayWingsAuthSdk(setAuthLogin);
  },

  async [ActionTypes.GET_USER_STATUS]({ commit }) {
    const { kycStatus, verificationStatus, rejectReason } = await defineUserStatus();

    commit(MutationTypes.SET_KYC_STATUS, kycStatus);
    commit(MutationTypes.SET_VERIFICATION_STATUS, verificationStatus);

    if (rejectReason) commit(MutationTypes.SET_REJECT_REASON, rejectReason);
  },

  async [ActionTypes.GET_USER_KYC_ATTEMPT]({ commit }) {
    const isFreeAttemptAvailable = await getFreeKycAttemptCount();

    commit(MutationTypes.SET_HAS_KYC_ATTEMPTS, isFreeAttemptAvailable);
  },

  async [ActionTypes.GET_XOR_PER_EURO_RATIO]({ commit }) {
    const xorPerEuroRatio = await getXorPerEuroRatio();

    commit(MutationTypes.SET_XOR_PER_EURO_RATIO, xorPerEuroRatio);
  },
};

export default actions;
