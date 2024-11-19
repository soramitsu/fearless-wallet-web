import type { State } from './state';
import { KycStatus, VerificationStatus } from '@/consts/soraCard';

export type Getters = {
  currentStatus(state: State): Nullable<VerificationStatus>;
};

export const getters: Getters = {
  currentStatus(state): Nullable<VerificationStatus> {
    const { kycStatus, verificationStatus } = state;

    if ([kycStatus, verificationStatus].includes(VerificationStatus.Rejected)) return VerificationStatus.Rejected;

    if (!kycStatus) return null;

    if (!verificationStatus) return null;

    if (kycStatus === KycStatus.Started) return null;

    const completedOrSuccessful = [KycStatus.Completed, KycStatus.Successful].includes(kycStatus);

    if (completedOrSuccessful && verificationStatus === VerificationStatus.Pending) return VerificationStatus.Pending;

    if (completedOrSuccessful && verificationStatus === VerificationStatus.Accepted) return VerificationStatus.Accepted;
  },
};
