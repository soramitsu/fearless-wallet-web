import { FPNumber } from '@sora-substrate/util';
import type { MutationTree } from 'vuex';
import type { State } from './state';
import { KycStatus, VerificationStatus } from '@/consts/soraCard';

export enum MutationTypes {
  SET_AUTH_LOGIN = 'SET_AUTH_LOGIN',
  SET_KYC_STATUS = 'SET_KYC_STATUS',
  SET_VERIFICATION_STATUS = 'SET_VERIFICATION_STATUS',
  SET_REJECT_REASON = 'SET_REJECT_REASON',
  SET_WILL_TO_KYC_PASS_KYC_AGAIN = 'SET_WILL_TO_KYC_PASS_KYC_AGAIN',
  SET_HAS_KYC_ATTEMPTS = 'SET_HAS_KYC_ATTEMPTS',
  SET_XOR_PER_EURO_RATIO = 'SET_XOR_PER_EURO_RATIO',
}

export type Mutations = {
  [MutationTypes.SET_AUTH_LOGIN](state: State, authLogin: any): void;
  [MutationTypes.SET_KYC_STATUS](state: State, status: Nullable<KycStatus>): void;
  [MutationTypes.SET_VERIFICATION_STATUS](state: State, status: Nullable<VerificationStatus>): void;
  [MutationTypes.SET_REJECT_REASON](state: State, rejectReason: string): void;
  [MutationTypes.SET_WILL_TO_KYC_PASS_KYC_AGAIN](state: State, value: boolean): void;
  [MutationTypes.SET_HAS_KYC_ATTEMPTS](state: State, hasAttempt: boolean): void;
  [MutationTypes.SET_XOR_PER_EURO_RATIO](state: State, ratio: number): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_LOGIN](state, authLogin) {
    state.authLogin = authLogin;
  },

  [MutationTypes.SET_KYC_STATUS](state, status) {
    state.kycStatus = status;
  },

  [MutationTypes.SET_VERIFICATION_STATUS](state, status) {
    state.verificationStatus = status;
  },

  [MutationTypes.SET_REJECT_REASON](state, rejectReason) {
    state.rejectReason = rejectReason;
  },

  [MutationTypes.SET_WILL_TO_KYC_PASS_KYC_AGAIN](state, value) {
    state.wantsToPassKycAgain = value;
  },

  [MutationTypes.SET_HAS_KYC_ATTEMPTS](state, hasAttempt) {
    state.hasFreeAttempts = hasAttempt;
  },

  [MutationTypes.SET_XOR_PER_EURO_RATIO](state, ratio) {
    state.xorPerEuroRatio = FPNumber.fromNatural(ratio);
  },
};

export default mutations;
