import { FPNumber } from '@sora-substrate/util';
import type { KycStatus, VerificationStatus } from '@/consts/soraCard';

export type State = {
  authLogin: any;
  kycStatus: Nullable<KycStatus>;
  verificationStatus: Nullable<VerificationStatus>;
  rejectReason: Nullable<string>;
  wantsToPassKycAgain: boolean;
  hasFreeAttempts: Nullable<boolean>;
  xorPerEuroRatio: FPNumber;
};

export const state = (): State => {
  return {
    authLogin: null,
    kycStatus: undefined,
    verificationStatus: undefined,
    rejectReason: null,
    wantsToPassKycAgain: false,
    hasFreeAttempts: null,
    xorPerEuroRatio: FPNumber.ZERO,
  };
};
