import { FPNumber } from '@sora-substrate/math';
import { KycStatus, VerificationStatus } from '@/consts/soraCard';

export type State = {
  authLogin: any;
  kycStatus: Nullable<KycStatus>;
  verificationStatus: Nullable<VerificationStatus>;
  rejectReason: Nullable<string>;
  wantsToPassKycAgain: boolean;
  hasFreeAttempts: Nullable<boolean>;
  xorPerEuroRatio: FPNumber;
};

const state = (): State => {
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

export default state;
