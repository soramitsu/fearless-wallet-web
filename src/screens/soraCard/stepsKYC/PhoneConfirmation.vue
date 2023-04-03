<template>
  <div class="phone-confirmation">
    <div class="phone-input">
      <Input v-model="phoneCode" placeholder="soraCard.code" size="big" class="phone-code" />

      <ValidatedInput
        v-model="phoneNumber"
        placeholder="soraCard.phoneNumber"
        size="big"
        class="phone"
        errorDescriptions="soraCard.invalidPhone"
        :isError="isErrorPhoneNumber"
      />

      <button :class="sendButtonClasses" :disabled="isErrorPhoneNumber" @click="sendCode">
        {{ sendButtontext }}
      </button>
    </div>

    <Hint iconName="notification" text="soraCard.yourTestCode" class="hint-code" />

    <ValidatedInput
      v-model="verificationCode"
      placeholder="soraCard.verificationCode"
      errorDescriptions="soraCard.invalidCode"
      :isError="isErrorCode"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { validatePhoneNumber } from '@/helpers/common';
import { RESEND_CODE_S } from '@/consts/soraCard';

@Component
export default class PhoneConfirmation extends Vue {
  readonly validCode = '123456';
  phoneCode = '';
  phoneNumber = '';
  verificationCode = '';
  leftTimeForResend = 0;
  isErrorCode = false;
  intervalSubscription: NodeJS.Timer | null = null;

  get isValidPhoneNumber() {
    return validatePhoneNumber(this.phoneNumber);
  }

  get isErrorPhoneNumber() {
    return this.phoneNumber !== '' && !this.isValidPhoneNumber;
  }

  get sendButtontext() {
    return this.intervalSubscription === null
      ? this.$t('soraCard.sendCode')
      : `${this.$t('soraCard.resend')} 0:${this.leftTimeForResend}`;
  }

  get sendButtonClasses() {
    return [
      'send-button',
      {
        'send-button-disabled': !this.isValidPhoneNumber || this.intervalSubscription !== null,
      },
    ];
  }

  @Watch('verificationCode')
  codeWatcher(verificationCode: string) {
    const isValidCode = verificationCode === this.validCode;

    this.isErrorCode = verificationCode !== '' && !isValidCode;

    this.$emit('toggleIsValidSmsCode', isValidCode);
  }

  sendCode() {
    if (!this.isValidPhoneNumber || this.intervalSubscription !== null) return;

    this.leftTimeForResend = RESEND_CODE_S - 1;

    this.intervalSubscription = setInterval(() => {
      this.leftTimeForResend -= 1;

      if (this.leftTimeForResend === 0) {
        clearInterval(this.intervalSubscription!);

        this.intervalSubscription = null;
      }
    }, 1000);

    // TODO send code
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
