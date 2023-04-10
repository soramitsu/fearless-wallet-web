<template>
  <div class="steps">
    <TermsAndConditions
      v-if="syncedStep === 2"
      ref="termsAndConditions"
      @proceed="proceed"
      @toggleCountriesFormVisibility="$emit('toggleCountriesFormVisibility')"
    />

    <Phone v-if="syncedStep === 3" @proceed="proceed" />

    <Email v-if="syncedStep === 4" @proceed="proceed" />

    <StepsKYCPopup v-if="showStepsKYCPopup" :fillSteps="[1]" :handlerClose="closeStepsKYCPopup" :proceed="proceed" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync, Ref } from 'vue-property-decorator';
import TermsAndConditions from '@/screens/soraCard/stepsKYC/TermsAndConditions.vue';
import Phone from '@/screens/soraCard/stepsKYC/Phone.vue';
import Email from '@/screens/soraCard/stepsKYC/Email.vue';
import StepsKYCPopup from '@/screens/soraCard/stepsKYC/StepsKYCPopup.vue';

@Component({
  components: {
    Phone,
    Email,
    StepsKYCPopup,
    TermsAndConditions,
  },
})
export default class StepsKYC extends Vue {
  showStepsKYCPopup = false;

  @PropSync('step', { type: Number }) syncedStep!: number;
  @Ref('termsAndConditions') readonly termsAndConditions!: TermsAndConditions;

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
}
</script>

<style scoped lang="scss">
.steps {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
</style>
