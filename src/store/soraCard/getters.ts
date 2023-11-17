import { type FPNumber } from '@sora-substrate/math';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import { KycStatus, VerificationStatus } from '@/consts/soraCard';

export enum GettersTypes {
  authLogin = 'authLogin',
  kycStatus = 'kycStatus',
  verificationStatus = 'verificationStatus',
  rejectReason = 'rejectReason',
  currentStatus = 'currentStatus',
  wantsToPassKycAgain = 'wantsToPassKycAgain',
  hasFreeAttempts = 'hasFreeAttempts',
  xorPerEuroRatio = 'xorPerEuroRatio',
}

export type Getters = {
  [GettersTypes.authLogin](state: State): string;
  [GettersTypes.kycStatus](state: State): Nullable<KycStatus>;
  [GettersTypes.verificationStatus](state: State): Nullable<VerificationStatus>;
  [GettersTypes.rejectReason](state: State): Nullable<string>;
  [GettersTypes.currentStatus](state: State): Nullable<VerificationStatus>;
  [GettersTypes.wantsToPassKycAgain](state: State): boolean;
  [GettersTypes.hasFreeAttempts](state: State): Nullable<boolean>;
  [GettersTypes.xorPerEuroRatio](state: State): FPNumber;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.authLogin]({ authLogin }) {
    return authLogin;
  },

  [GettersTypes.kycStatus]({ kycStatus }) {
    return kycStatus;
  },

  [GettersTypes.verificationStatus]({ verificationStatus }) {
    return verificationStatus;
  },

  [GettersTypes.rejectReason]({ rejectReason }) {
    return rejectReason;
  },

  [GettersTypes.wantsToPassKycAgain]({ wantsToPassKycAgain }) {
    return wantsToPassKycAgain;
  },

  [GettersTypes.hasFreeAttempts]({ hasFreeAttempts }) {
    return hasFreeAttempts;
  },

  [GettersTypes.currentStatus](state) {
    const { kycStatus, verificationStatus } = state;

    if ([kycStatus, verificationStatus].includes(VerificationStatus.Rejected)) {
      return VerificationStatus.Rejected;
    }

    if (!kycStatus) return null;

    if (!verificationStatus) return null;

    if (kycStatus === KycStatus.Started) return null;

    const completedOrSuccessful = [KycStatus.Completed, KycStatus.Successful].includes(kycStatus);

    if (completedOrSuccessful && verificationStatus === VerificationStatus.Pending) {
      return VerificationStatus.Pending;
    }

    if (completedOrSuccessful && verificationStatus === VerificationStatus.Accepted) {
      return VerificationStatus.Accepted;
    }
  },

  [GettersTypes.xorPerEuroRatio]({ xorPerEuroRatio }) {
    return xorPerEuroRatio;
  },
};

export default getters;
