<template>
  <div class="phone-confirmation">
    <div class="phone-input">
      <Input
        v-model="countryCode"
        ref="countryCode"
        placeholder="soraCard.code"
        size="big"
        class="phone-code"
        :disabled="phoneInputDisabled"
      />

      <ValidatedInput
        v-model="phoneNumber"
        ref="phoneNumber"
        placeholder="soraCard.phoneNumber"
        size="big"
        class="phone"
        errorDescriptions="soraCard.invalidPhone"
        :maxlength="10"
        :isError="isErrorPhoneNumber"
        :disabled="phoneInputDisabled"
      />

      <button :class="sendButtonClasses" :disabled="isErrorPhoneNumber" @click="sendCode">
        {{ sendButtontext }}
      </button>
    </div>

    <Hint iconName="notification" text="soraCard.yourTestCode" class="hint-code" />

    <ValidatedInput
      v-model="syncedOtpCode"
      ref="otpCode"
      placeholder="soraCard.verificationCode"
      errorDescriptions="soraCard.codeLength"
      :isError="isErrorCode"
      :disabled="otpInputDisabled"
      :maxlength="otpCodeLength"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync, Ref } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import type Input from '@/components/Input.vue';
import type { AsyncFn } from '@/interfaces';
import { validatePhoneNumber } from '@/helpers/common';
import { RESEND_INTERVAL, OTP_CODE_LENGTH } from '@/consts/soraCard';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';

@Component
export default class Phone extends Vue {
  readonly otpCodeLength = OTP_CODE_LENGTH;
  countryCodeInternal = '';
  phoneNumberInternal = '';
  leftTimeForResend = 0;
  smsSent = false;

  @Ref('countryCode') readonly countryCodeComponent!: Input;
  @Ref('phoneNumber') readonly phoneNumberComponent!: ValidatedInput;
  @Ref('otpCode') private readonly otpComponent!: ValidatedInput;
  @PropSync('otpCode', { type: String }) syncedOtpCode!: string;

  @Action(SoraCardActionTypes.INIT_AUTH_LOGIN) initAuthLogin!: AsyncFn;
  @Getter(SoraCardGettersTypes.authLogin) authLogin!: any;

  get isErrorCode() {
    return this.syncedOtpCode !== '' && this.syncedOtpCode.length !== this.otpCodeLength;
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

    this.countryCodeInternal = value;
  }

  get phoneNumber() {
    return this.phoneNumberInternal;
  }

  set phoneNumber(value: string) {
    if (value.length === 0) {
      this.countryCodeComponent.input.focus();
    }

    this.phoneNumberInternal = value;
  }

  get isPhoneNumberValid() {
    return validatePhoneNumber(this.countryCode, this.phoneNumber);
  }

  get isErrorPhoneNumber() {
    return this.phoneNumber !== '' && !this.isPhoneNumberValid;
  }

  get sendButtontext() {
    return this.smsSent ? `${this.$t('soraCard.resend')} 0:${this.leftTimeForResend}` : this.$t('soraCard.sendCode');
  }

  get sendButtonClasses() {
    return [
      'send-button',
      {
        'send-button-disabled': !this.isPhoneNumberValid || this.smsSent,
      },
    ];
  }

  async mounted() {
    this.countryCodeComponent.input.focus();

    await this.initAuthLogin();
  }

  sendCode() {
    if (!this.isPhoneNumberValid || this.smsSent) return;

    // TODO send code

    this.leftTimeForResend = RESEND_INTERVAL;

    const interval = setInterval(() => {
      this.leftTimeForResend -= 1;

      if (this.leftTimeForResend === 0) {
        clearInterval(interval!);

        this.smsSent = false;
      }
    }, 1000);

    this.smsSent = true;
    this.$nextTick(() => this.otpComponent.input.focus());
  }
}
</script>

<style scoped lang="scss">
.phone-confirmation {
  display: flex;
  flex-direction: column;

  .phone-input {
    display: flex;
    position: relative;

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
