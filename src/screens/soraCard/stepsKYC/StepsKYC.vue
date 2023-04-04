<template>
  <div class="steps">
    <div>
      <DisclaimerForm v-if="syncedStep === 2" @toggleCountriesFormVisibility="$emit('toggleCountriesFormVisibility')" />

      <Phone v-if="syncedStep === 3" :otpCode="otpCode" @update:otpCode="setOtpCode" />

      <Email v-if="syncedStep === 4" @toggleIsValidEmailForm="toggleIsValidEmailForm" />

      <div class="disclaimer">
        <span class="disclaimer-label">{{ $t('common.disclaimer') }}: </span>

        {{ $t('soraCard.disclaimerSoraCard') }}
      </div>
    </div>

    <Button
      :text="textIssueCardButton"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      :disabled="disabledProceedButton"
      @click="proceed"
    />

    <StepsKYCPopup v-if="showStepsKYCPopup" :fillSteps="[1]" :handlerClose="closeStepsKYCPopup" :proceed="proceed" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync } from 'vue-property-decorator';
import DisclaimerForm from '@/screens/soraCard/stepsKYC/DisclaimerForm.vue';
import Phone from '@/screens/soraCard/stepsKYC/Phone.vue';
import Email from '@/screens/soraCard/stepsKYC/Email.vue';
import StepsKYCPopup from '@/screens/soraCard/stepsKYC/StepsKYCPopup.vue';
import { OTP_CODE_LENGTH } from '@/consts/soraCard';

@Component({
  components: {
    Phone,
    Email,
    StepsKYCPopup,
    DisclaimerForm,
  },
})
export default class StepsKYC extends Vue {
  isValidEmailForm = false;
  showStepsKYCPopup = false;
  otpCode = '';

  @PropSync('step', { type: Number }) syncedStep!: number;

  get textIssueCardButton() {
    if (this.syncedStep === 2) return 'common.acceptContinue';

    if (this.syncedStep === 3) return 'soraCard.confirmSMScode';

    if (this.syncedStep === 4) return 'soraCard.sendVerificationEmail';

    return '';
  }

  get disabledProceedButton() {
    if (this.syncedStep === 3) return this.otpCode.length !== OTP_CODE_LENGTH;

    if (this.syncedStep === 4) return !this.isValidEmailForm;

    return false;
  }

  proceed() {
    if (this.syncedStep === 2 && !this.showStepsKYCPopup) this.showStepsKYCPopup = true;
    else {
      this.syncedStep += 1;
      this.showStepsKYCPopup = false;
    }
  }

  closeStepsKYCPopup() {
    this.showStepsKYCPopup = false;
  }

  toggleIsValidEmailForm(value: boolean) {
    this.isValidEmailForm = value;
  }

  setOtpCode(value: string) {
    this.otpCode = value;
  }
}
</script>

<style scoped lang="scss">
.steps {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.disclaimer {
  margin-top: 16px;
  text-align: left;
  font-size: 14px;
  padding: 0 16px;
  color: $gray-color;

  .disclaimer-label {
    color: $simple-orange-color;
  }
}
</style>
