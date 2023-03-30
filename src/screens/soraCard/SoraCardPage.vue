<template>
  <AboveForm
    :header="headerForm"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :handlerBack="handlerBack"
    :closeHandler="closeHandler"
  >
    <div class="container">
      <Preview v-if="step === 1" @proceed="proceed" />

      <UnsupportedCountries v-else-if="showCountriesForm" />

      <template v-else>
        <KYC
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
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import KYC from '@/screens/soraCard/KYC.vue';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import Preview from '@/screens/soraCard/Preview.vue';

@Component({
  components: {
    KYC,
    Preview,
    UnsupportedCountries,
  },
})
export default class SoraCardPage extends Vue {
  showCountriesForm = false;
  isValidSmsCode = false;
  isValidEmailForm = false;
  step = 1; // TODO revert to 1

  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get disabledProceedButton() {
    if (this.step === 3) return !this.isValidSmsCode;

    if (this.step === 4) return !this.isValidEmailForm;

    return false;
  }

  get showBackIcon() {
    return this.step !== 1;
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

  closeHandler() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }

  proceed() {
    this.step += 1;
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
