import { FPNumber } from '@sora-substrate/util';
import type { SoraCardStore } from '.';
import { useExtensionStore } from '@/stores/extension';
import { initPayWingsAuthSdk, defineUserStatus, getFreeKycAttemptCount, getXorPerEuroRatio } from '@/util/soraCard';
import { type KycStatus, type VerificationStatus } from '@/consts/soraCard';

type Actions = {
  initAuthLogin(this: SoraCardStore): Promise<void>;
  getUserStatus(this: SoraCardStore): Promise<void>;
  getUserKycAttempt(this: SoraCardStore): Promise<void>;
  getXorPerEuroRatio(this: SoraCardStore): Promise<void>;
  setWillToPassKycAgain(this: SoraCardStore, value: boolean): Promise<void>;
  setKycStatus(this: SoraCardStore, status: Nullable<KycStatus>): void;
  setVerificationStatus(this: SoraCardStore, status: Nullable<VerificationStatus>): void;
};

export const actions: Actions = {
  setKycStatus(status) {
    this.kycStatus = status;
  },

  setVerificationStatus(status) {
    this.verificationStatus = status;
  },

  async initAuthLogin() {
    const setAuthLogin = (login: any) => (this.authLogin = login);

    await initPayWingsAuthSdk(setAuthLogin);
  },

  async getUserStatus() {
    const extensionStore = useExtensionStore();

    if (!extensionStore.$state.features?.fiat.soraCard) return;

    const { kycStatus, verificationStatus, rejectReason } = await defineUserStatus();

    this.kycStatus = kycStatus;
    this.verificationStatus = verificationStatus;

    if (rejectReason) this.rejectReason = rejectReason;
  },

  async getUserKycAttempt() {
    const isFreeAttemptAvailable = await getFreeKycAttemptCount();

    this.hasFreeAttempts = isFreeAttemptAvailable;
  },

  async getXorPerEuroRatio() {
    const xorPerEuroRatio = await getXorPerEuroRatio();

    this.xorPerEuroRatio = FPNumber.fromNatural(xorPerEuroRatio);
  },

  async setWillToPassKycAgain(value) {
    this.wantsToPassKycAgain = value;
  },
};
