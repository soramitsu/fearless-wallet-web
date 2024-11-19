<template>
  <div class="phone-confirmation">
    <div>
      <div class="phone-input">
        <FInput
          :value="countryCode"
          ref="countryCode"
          size="big"
          class="phone-code"
          :placeholder="countryCodePlaceholder"
          :disabled="phoneInputDisabled"
          @change="changeCountryCode"
        />

        <ValidatedInput
          :value="phoneNumber"
          ref="phoneNumber"
          placeholder="soraCard.phoneNumber"
          size="big"
          class="phone"
          :errorDescriptions="errorDescriptionsPhone"
          :maxlength="10"
          :isError="isErrorPhoneNumber"
          :disabled="phoneInputDisabled"
          @change="changePhoneNumber"
        />

        <button :class="sendButtonClasses" :disabled="disabledSendOtpButton" @click="sendCode">
          {{ sendButtontext }}
        </button>
      </div>

      <ValidatedInput
        :value="verificationCode"
        ref="verificationCode"
        placeholder="soraCard.verificationCode"
        :errorDescriptions="errorDescriptionsOtp"
        :isError="isErrorCode"
        :disabled="otpInputDisabled"
        :maxlength="otpCodeLength"
        @change="changeVerificationCode"
      />

      <Disclaimer />
    </div>

    <FButton
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
import { type FPNumber } from '@sora-substrate/util';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import type FInput from '@/components/FInput.vue';
import { validatePhoneNumber } from '@/helpers';
import { RESEND_INTERVAL, OTP_CODE_LENGTH, VerificationStatus, StepsKyc } from '@/consts/soraCard';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';
import { soraCardController } from '@/controllers';
import { calculateXOREuroBalance, isValidEuroBalanceXor } from '@/util/soraCard';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/sora';
import { useAccountsStore } from '@/stores/accounts';
import { useSoraCardStore } from '@/stores/soraCard';

@Component({
  components: { Disclaimer },
})
export default class Phone extends Vue {
  readonly otpCodeLength = OTP_CODE_LENGTH;
  readonly soraNetworkName = SORA_NETWORK_NAME;
  accountsStore = useAccountsStore();
  soraCardStore = useSoraCardStore();
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
  @Ref('countryCode') readonly countryCodeComponent!: typeof FInput;
  @Ref('phoneNumber') readonly phoneNumberComponent!: typeof ValidatedInput;
  @Ref('verificationCode') private readonly otpComponent!: typeof ValidatedInput;

  get currencyXOR() {
    return getXORCurrency(this.accountsStore.balances);
  }

  get euroBalanceXOR() {
    return calculateXOREuroBalance(this.currencyXOR, this.soraCardStore.xorPerEuroRatio as FPNumber) ?? 0;
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    if (value.length === 0) this.countryCodeComponent.input.focus();

    const isDeleteSymbol = value.length < this.phoneNumberInternal.length;
    const isNumber = !Number.isNaN(+value[value.length - 1]);

    if (isNumber || isDeleteSymbol) this.phoneNumberInternal = value;
  }

  changePhoneNumber(value: string) {
    this.phoneNumberInternal = value;
  }

  changeVerificationCode(value: string) {
    this.verificationCode = value;
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    this.countryCodeComponent.input.focus();
    soraCardController.removePWEmail();

    await this.soraCardStore.initAuthLogin();

    if (!this.soraCardStore.authLogin) return;

    this.soraCardStore.authLogin
      .on('SendOtp-Success', () => {
        this.smsSent = true;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
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
        await this.soraCardStore.getUserStatus();

        if (this.soraCardStore.currentStatus === VerificationStatus.Rejected) {
          await this.soraCardStore.getUserKycAttempt();

          if (this.soraCardStore.wantsToPassKycAgain && this.soraCardStore.hasFreeAttempts) {
            this.$emit('confirm', StepsKyc.KycView);
            this.soraCardStore.setWillToPassKycAgain(false);

            return;
          }
        }

        if (this.soraCardStore.currentStatus) this.$emit('confirm');
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

    this.soraCardStore.authLogin.PayWingsOtpCredentialVerification(this.verificationCode).catch((error: string) => {
      this.verifyOtpBtnLoading = false;
      this.verificationCode = '';
      this.enteredOTpCodeIsIncorrect = true;

      console.error('[SoraCard]: Auth', error);
    });
  }

  sendCode() {
    if (!this.isPhoneNumberValid || this.smsSent) return;

    this.soraCardStore.authLogin
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

  changeCountryCode(value: string) {
    this.countryCode = value;
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
      font-size: 0.75em;
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
