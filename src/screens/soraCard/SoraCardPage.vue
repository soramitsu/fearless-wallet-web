<template>
  <AboveForm
    :header="headerForm"
    :showAnimation="false"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :handlerBack="handlerBack"
    :closeHandler="closeForm"
  >
    <div class="container">
      <UnsupportedCountries v-if="showCountriesForm" />

      <Preview
        v-else-if="step === 1"
        @proceed="proceed"
        @openGetXORPopup="toggleGetXORPopup"
        @toggleCountriesFormVisibility="toggleCountriesFormVisibility"
      />

      <template v-else>
        <StepsKYC
          :step="step"
          @toggleCountriesFormVisibility="toggleCountriesFormVisibility"
          @toggleIsValidSmsCode="toggleIsValidSmsCode"
          @toggleIsValidEmailForm="toggleIsValidEmailForm"
        />

        <Button
          :text="textIssueCardButton"
          width="100%"
          size="big"
          fontSize="big"
          :border="false"
          :disabled="disabledProceedButton"
          @click="proceed"
        />
      </template>
    </div>

    <StepsKYCPopup v-if="showStepsKYCPopup" :fillSteps="[1]" :handlerClose="toggleGetXORPopup" :proceed="proceed" />

    <GetXORPopup v-if="showGetXORPopup" :handlerClose="closeGetXORPopup" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import StepsKYC from '@/screens/soraCard/stepsKYC/StepsKYC.vue';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import Preview from '@/screens/soraCard/Preview.vue';
import StepsKYCPopup from '@/screens/soraCard/stepsKYC/StepsKYCPopup.vue';
import GetXORPopup from '@/screens/soraCard/GetXORPopup.vue';

@Component({
  components: {
    Preview,
    StepsKYC,
    GetXORPopup,
    StepsKYCPopup,
    UnsupportedCountries,
  },
})
export default class SoraCardPage extends Vue {
  showCountriesForm = false;
  isValidSmsCode = false;
  isValidEmailForm = false;
  showStepsKYCPopup = false;
  showGetXORPopup = false;
  step = 1;

  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get showBackIcon() {
    return this.showCountriesForm || this.step > 1;
  }

  get disabledProceedButton() {
    if (this.step === 3) return !this.isValidSmsCode;

    if (this.step === 4) return !this.isValidEmailForm;

    return false;
  }

  get headerForm() {
    if (this.step === 1) return 'soraCard.title';

    if (this.step === 2) {
      if (this.showCountriesForm) return 'soraCard.unsupportedCountries';

      return 'common.termsConditions';
    }

    if (this.step === 3) return 'soraCard.phoneConfirmation';

    if (this.step === 4) return 'soraCard.emailConfirmation';

    if (this.step === 5) return 'soraCard.completeKYC';

    return '';
  }

  get textIssueCardButton() {
    if (this.step === 2) return 'common.acceptContinue';

    if (this.step === 3) return 'soraCard.confirmSMScode';

    if (this.step === 4) return 'soraCard.sendVerificationEmail';

    return '';
  }

  handlerBack() {
    if (this.showCountriesForm) this.toggleCountriesFormVisibility();
    else this.step -= 1;
  }

  closeForm() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }

  closeGetXORPopup() {
    this.showGetXORPopup = false;
  }

  proceed() {
    if (this.step === 2 && !this.showStepsKYCPopup) this.showStepsKYCPopup = true;
    else {
      this.step += 1;
      this.showStepsKYCPopup = false;
    }
  }

  toggleGetXORPopup() {
    this.showGetXORPopup = true;
  }

  toggleCountriesFormVisibility() {
    this.showCountriesForm = !this.showCountriesForm;
  }

  toggleIsValidSmsCode(value: boolean) {
    this.isValidSmsCode = value;
  }

  toggleIsValidEmailForm(value: boolean) {
    this.isValidEmailForm = value;
  }
}
</script>

<style scoped lang="scss">
.container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}
</style>
