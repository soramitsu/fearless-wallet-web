<template>
  <div class="phone-confirmation">
    <div>
      <div class="phone-input">
        <Input
          v-model="countryCode"
          ref="countryCode"
          size="big"
          class="phone-code"
          :placeholder="countryCodePlaceholder"
          :disabled="phoneInputDisabled"
        />

        <ValidatedInput
          v-model="phoneNumber"
          ref="phoneNumber"
          placeholder="soraCard.phoneNumber"
          size="big"
          class="phone"
          :errorDescriptions="errorDescriptionsPhone"
          :maxlength="10"
          :isError="isErrorPhoneNumber"
          :disabled="phoneInputDisabled"
        />

        <button :class="sendButtonClasses" :disabled="disabledSendOtpButton" @click="sendCode">
          {{ sendButtontext }}
        </button>
      </div>

      <ValidatedInput
        v-model="verificationCode"
        ref="verificationCode"
        placeholder="soraCard.verificationCode"
        :errorDescriptions="errorDescriptionsOtp"
        :isError="isErrorCode"
        :disabled="otpInputDisabled"
        :maxlength="otpCodeLength"
      />

      <Disclaimer />
    </div>

    <Button
      :text="verifyBtnText"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      :disabled="disabledProceedButton"
      :loading="verifyOtpBtnLoading"
      @click="verifyCode"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Ref, Watch, Prop } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import type Input from '@/components/Input.vue';
import type { AsyncFn, Fn } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { validatePhoneNumber } from '@/helpers/common';
import { RESEND_INTERVAL, OTP_CODE_LENGTH, VerificationStatus, StepsKyc } from '@/consts/soraCard';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';
import { soraCardController } from '@/controllers';
import { MutationTypes as SoraCardMutationTypes } from '@/store/soraCard/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { calculateXOREuroBalance, isValidEuroBalanceXor } from '@/util/soraCard';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';

@Component({
  components: { Disclaimer },
})
export default class Phone extends Vue {
  readonly otpCodeLength = OTP_CODE_LENGTH;
  readonly soraNetworkName = SORA_NETWORK_NAME;
  countryCodeInternal = '';
  phoneNumberInternal = '';
  verificationCode = '';
  leftTimeForResend = 0;
  smsSent = false;
  verifyOtpBtnLoading = false;
  enteredOTpCodeIsIncorrect = false;
  notFoundPhoneWhenUserApplied = false;
  notPassedKycAndNotHasXorEnough = false;

  @Prop({ default: false, type: Boolean }) userApplied!: boolean;
  @Ref('countryCode') readonly countryCodeComponent!: Input;
  @Ref('phoneNumber') readonly phoneNumberComponent!: ValidatedInput;
  @Ref('verificationCode') private readonly otpComponent!: ValidatedInput;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(SoraCardGettersTypes.authLogin) authLogin!: any;
  @Getter(SoraCardGettersTypes.currentStatus) currentStatus!: VerificationStatus;
  @Getter(SoraCardGettersTypes.wantsToPassKycAgain) wantsToPassKycAgain!: boolean;
  @Getter(SoraCardGettersTypes.hasFreeAttempts) hasFreeAttempts!: boolean;
  @Getter(SoraCardGettersTypes.xorPerEuroRatio) xorPerEuroRatio!: FPNumber;
  @Action(SoraCardActionTypes.INIT_AUTH_LOGIN) initAuthLogin!: AsyncFn;
  @Action(SoraCardActionTypes.GET_USER_STATUS) getUserStatus!: AsyncFn;
  @Action(SoraCardActionTypes.GET_USER_KYC_ATTEMPT) getUserKycAttempt!: AsyncFn;
  @Mutation(SoraCardMutationTypes.SET_WILL_TO_KYC_PASS_KYC_AGAIN) setWillToPassKycAgain!: Fn<boolean>;

  get currencyXOR() {
    return getXORCurrency(this.balances);
  }

  get euroBalanceXOR() {
    return calculateXOREuroBalance(this.currencyXOR, this.xorPerEuroRatio) ?? 0;
  }

  get isValidEuroBalanceXor() {
    return isValidEuroBalanceXor(this.euroBalanceXOR) ?? false;
  }

  get errorDescriptionsPhone(): string {
    return this.notFoundPhoneWhenUserApplied ? 'soraCard.numberNotFound' : 'soraCard.invalidPhone';
  }

  get countryCodePlaceholder(): string {
    return this.countryCode ? 'soraCard.code' : '+44';
  }

  get errorDescriptionsOtp() {
    return this.enteredOTpCodeIsIncorrect ? 'soraCard.invalidCode' : 'soraCard.codeLength';
  }

  get disabledSendOtpButton() {
    return this.isErrorPhoneNumber || this.notPassedKycAndNotHasXorEnough;
  }

  get disabledProceedButton() {
    return (
      this.verificationCode.length !== OTP_CODE_LENGTH ||
      this.verifyOtpBtnLoading ||
      this.notPassedKycAndNotHasXorEnough
    );
  }

  get isErrorCode() {
    return (
      (this.verificationCode !== '' && this.verificationCode.length !== this.otpCodeLength) ||
      this.enteredOTpCodeIsIncorrect
    );
  }

  get otpInputDisabled() {
    return !this.smsSent || this.notFoundPhoneWhenUserApplied;
  }

  get phoneInputDisabled() {
    return this.smsSent;
  }

  get countryCode() {
    return this.countryCodeInternal;
  }

  set countryCode(value: string) {
    if (value.length > 3) this.phoneNumberComponent.input.focus();

    const isDeleteSymbol = value.length < this.countryCodeInternal.length;
    const isNumber = !Number.isNaN(+value[value.length - 1]);

    if (isNumber || isDeleteSymbol) {
      if (value.length === 1) this.countryCodeInternal = isDeleteSymbol ? '' : `+${value}`;
      else this.countryCodeInternal = value;
    }
  }

  get phoneNumber() {
    return this.phoneNumberInternal;
  }

  set phoneNumber(value: string) {
    if (value.length === 0) this.countryCodeComponent.input.focus();

    const isDeleteSymbol = value.length < this.phoneNumberInternal.length;
    const isNumber = !Number.isNaN(+value[value.length - 1]);

    if (isNumber || isDeleteSymbol) this.phoneNumberInternal = value;
  }

  get isPhoneNumberValid() {
    return validatePhoneNumber(this.countryCode, this.phoneNumber);
  }

  get isErrorPhoneNumber() {
    return (this.phoneNumber !== '' && !this.isPhoneNumberValid) || this.notFoundPhoneWhenUserApplied;
  }

  get verifyBtnText() {
    if (this.notPassedKycAndNotHasXorEnough) {
      return { text: 'assets.insufficientBalance', localeProps: { asset: SORA_UTILITY_ASSET.toUpperCase() } };
    }

    return 'soraCard.confirmSMScode';
  }

  get sendButtontext() {
    if (this.smsSent) {
      return `${this.$t('soraCard.resend')} 0:${this.leftTimeForResend < 10 ? '0' : ''}${this.leftTimeForResend}`;
    }

    return this.$t('soraCard.sendCode');
  }

  get sendButtonClasses() {
    return [
      'send-button',
      {
        'send-button-disabled': !this.isPhoneNumberValid || this.smsSent || this.notPassedKycAndNotHasXorEnough,
      },
    ];
  }

  @Watch('verificationCode')
  otpCodeWatcher(value: string) {
    if (value !== '') this.enteredOTpCodeIsIncorrect = false;
  }

  @Watch('isValidEuroBalanceXor')
  isValidEuroBalanceXorWatcher(isEnough: boolean) {
    if (isEnough) {
      this.notPassedKycAndNotHasXorEnough = false;
      this.verificationCode = '';
      this.smsSent = false;
    }
  }

  async mounted() {
    this.countryCodeComponent.input.focus();
    soraCardController.removePWEmail();

    await this.initAuthLogin();

    if (!this.authLogin) return;

    this.authLogin
      .on('SendOtp-Success', () => {
        this.smsSent = true;

        this.$nextTick(() => this.otpComponent.input.focus());
      })
      .on('MinimalRegistrationReq', () => {
        this.verifyOtpBtnLoading = false;

        if (this.userApplied) {
          this.notFoundPhoneWhenUserApplied = true;
          this.verificationCode = '';

          return;
        }

        if (!this.isValidEuroBalanceXor) {
          this.notPassedKycAndNotHasXorEnough = true;

          return;
        }

        this.$emit('confirm', StepsKyc.Email);
      })
      .on('Otp-Verification-Success', async () => {
        await this.getUserStatus();

        if (this.currentStatus === VerificationStatus.Rejected) {
          await this.getUserKycAttempt();

          if (this.wantsToPassKycAgain && this.hasFreeAttempts) {
            this.$emit('confirm', StepsKyc.KycView);
            this.setWillToPassKycAgain(false);

            return;
          }
        }

        if (this.currentStatus) this.$emit('confirm');
        else {
          if (!this.isValidEuroBalanceXor) {
            this.notPassedKycAndNotHasXorEnough = true;
            this.verifyOtpBtnLoading = false;

            return;
          }

          this.$emit('confirm', StepsKyc.KycView);
        }
      })
      .on('Verification-Email-Sent-Success', () => {
        this.verifyOtpBtnLoading = false;

        if (!this.isValidEuroBalanceXor) {
          this.notPassedKycAndNotHasXorEnough = true;

          return;
        }

        this.$emit('confirm', StepsKyc.Email);
      });
  }

  verifyCode(): void {
    this.verifyOtpBtnLoading = true;

    this.authLogin.PayWingsOtpCredentialVerification(this.verificationCode).catch((error: string) => {
      this.verifyOtpBtnLoading = false;
      this.verificationCode = '';
      this.enteredOTpCodeIsIncorrect = true;

      console.error('[SoraCard]: Auth', error);
    });
  }

  sendCode() {
    if (!this.isPhoneNumberValid || this.smsSent) return;

    this.authLogin
      .PayWingsSendOtp(`${this.countryCode}${this.phoneNumber}`, 'Your verification code is: @Otp')
      .catch((error: string) => {
        console.error('[SoraCard]: Auth', error);
      });

    this.startInterval();

    this.smsSent = true;
  }

  startInterval() {
    this.leftTimeForResend = RESEND_INTERVAL;

    const interval = setInterval(() => {
      this.leftTimeForResend -= 1;

      if (this.leftTimeForResend === 0) {
        this.smsSent = false;
        this.notFoundPhoneWhenUserApplied = false;
        this.verificationCode = '';

        clearInterval(interval);
      }
    }, 1000);
  }
}
</script>

<style scoped lang="scss">
.phone-confirmation {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .phone-input {
    display: flex;
    position: relative;
    margin-bottom: 16px;

    .phone-code {
      width: 90px;
      margin-right: 10px;
    }

    .phone {
      flex-grow: 1;
    }

    .send-button {
      border-radius: 16px;
      background: $pink-purple-color;
      height: 30px;
      font-weight: 700;
      font-size: 12px;
      padding: 0 12px;
      border: none;
      color: $gray-color;
      cursor: pointer;
      position: absolute;
      right: 20px;
      top: 15px;
      text-transform: uppercase;

      &:hover {
        background: rgba(108, 22, 195, 0.25);
      }
    }

    .send-button-disabled {
      background: $default-background-color;
      cursor: default;

      &:hover {
        background: $default-background-color;
      }
    }
  }

  .hint-code {
    margin: 15px 0 15px 16px;
  }
}
</style>
