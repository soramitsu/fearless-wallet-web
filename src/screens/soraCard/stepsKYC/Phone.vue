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
          errorDescriptions="soraCard.invalidPhone"
          class="phone"
          :maxlength="10"
          :isError="isErrorPhoneNumber"
          :disabled="phoneInputDisabled"
        />

        <button :class="sendButtonClasses" :disabled="isErrorPhoneNumber" @click="sendCode">
          {{ sendButtontext }}
        </button>
      </div>

      <ValidatedInput
        v-model="otpCode"
        ref="otpCode"
        placeholder="soraCard.verificationCode"
        :errorDescriptions="errorDescriptionsOtp"
        :isError="isErrorCode"
        :disabled="otpInputDisabled"
        :maxlength="otpCodeLength"
      />

      <Disclaimer />
    </div>

    <Button
      text="soraCard.confirmSMScode"
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
import { Component, Vue, Ref, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import type Input from '@/components/Input.vue';
import type { AsyncFn } from '@/interfaces';
import { validatePhoneNumber } from '@/helpers/common';
import { RESEND_INTERVAL, OTP_CODE_LENGTH } from '@/consts/soraCard';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';
import { soraCardController } from '@/controllers';
import { isNumber } from '@/helpers/numbers';

@Component({
  components: { Disclaimer },
})
export default class Phone extends Vue {
  readonly otpCodeLength = OTP_CODE_LENGTH;
  countryCodeInternal = '';
  phoneNumberInternal = '';
  otpCode = '';
  leftTimeForResend = 0;
  smsSent = false;
  verifyOtpBtnLoading = false;
  enteredOTpCodeIsIncorrect = false;

  @Ref('countryCode') readonly countryCodeComponent!: Input;
  @Ref('phoneNumber') readonly phoneNumberComponent!: ValidatedInput;
  @Ref('otpCode') private readonly otpComponent!: ValidatedInput;

  @Action(SoraCardActionTypes.INIT_AUTH_LOGIN) initAuthLogin!: AsyncFn;
  @Getter(SoraCardGettersTypes.authLogin) authLogin!: any;

  get countryCodePlaceholder(): string {
    return this.countryCode ? 'soraCard.code' : '+44';
  }

  get errorDescriptionsOtp() {
    return this.enteredOTpCodeIsIncorrect ? 'soraCard.invalidCode' : 'soraCard.codeLength';
  }

  get disabledProceedButton() {
    return this.otpCode.length !== OTP_CODE_LENGTH || this.verifyOtpBtnLoading;
  }

  get isErrorCode() {
    return (this.otpCode !== '' && this.otpCode.length !== this.otpCodeLength) || this.enteredOTpCodeIsIncorrect;
  }

  get otpInputDisabled() {
    return !this.smsSent;
  }

  get phoneInputDisabled() {
    return this.smsSent;
  }

  get countryCode() {
    return this.countryCodeInternal;
  }

  set countryCode(value: string) {
    if (value.length > 3) {
      this.phoneNumberComponent.input.focus();
    }

    const isDeleteSymbol = value.length < this.countryCodeInternal.length;

    if (isNumber(value[value.length - 1]) || isDeleteSymbol) {
      if (value.length === 1) {
        this.countryCodeInternal = isDeleteSymbol ? '' : `+${value}`;
      } else this.countryCodeInternal = value;
    }
  }

  get phoneNumber() {
    return this.phoneNumberInternal;
  }

  set phoneNumber(value: string) {
    if (value.length === 0) {
      this.countryCodeComponent.input.focus();
    }

    if (isNumber(value[value.length - 1]) || value.length < this.phoneNumberInternal.length)
      this.phoneNumberInternal = value;
  }

  get isPhoneNumberValid() {
    return validatePhoneNumber(this.countryCode, this.phoneNumber);
  }

  get isErrorPhoneNumber() {
    return this.phoneNumber !== '' && !this.isPhoneNumberValid;
  }

  get sendButtontext() {
    return this.smsSent
      ? `${this.$t('soraCard.resend')} 0:${this.leftTimeForResend < 10 ? '0' : ''}${this.leftTimeForResend}`
      : this.$t('soraCard.sendCode');
  }

  get sendButtonClasses() {
    return [
      'send-button',
      {
        'send-button-disabled': !this.isPhoneNumberValid || this.smsSent,
      },
    ];
  }

  @Watch('otpCode')
  otpCodeWatcher(value: string) {
    if (value !== '') this.enteredOTpCodeIsIncorrect = false;
  }

  async mounted() {
    this.countryCodeComponent.input.focus();

    soraCardController.removePWEmail();

    await this.initAuthLogin();

    if (!this.authLogin) return;
  }

  verifyCode(): void {
    this.verifyOtpBtnLoading = true;

    this.authLogin
      .PayWingsOtpCredentialVerification(this.otpCode)
      .then(() => this.$emit('proceed'))
      .catch((error: string) => {
        this.verifyOtpBtnLoading = false;
        this.otpCode = '';
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
    this.$nextTick(() => this.otpComponent.input.focus());
  }

  startInterval() {
    this.leftTimeForResend = RESEND_INTERVAL;

    const interval = setInterval(() => {
      this.leftTimeForResend -= 1;

      if (this.leftTimeForResend === 0) {
        this.smsSent = false;

        clearInterval(interval!);
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
