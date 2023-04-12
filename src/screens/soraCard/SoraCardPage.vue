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
      <X1Form v-if="showX1Form" :handlerClose="closeX1Form" />

      <UnsupportedCountries v-else-if="showCountriesForm" />

      <Preview
        v-else-if="showPreview"
        @openGetXORPopup="openGetXORPopup"
        @confirmApply="confirmApply"
        @toggleCountriesFormVisibility="toggleCountriesFormVisibility"
      />

      <TermsAndConditions
        v-else-if="showTermsAndConditions"
        ref="termsAndConditions"
        @openStepsKYCPopup="openStepsKYCPopup"
        @toggleCountriesFormVisibility="toggleCountriesFormVisibility"
      />

      <Phone v-else-if="showPhone" @confirm="confirmPhone" :userApplied="userApplied" />

      <Email v-else-if="showEmail" @confirmEmail="confirmEmail" />

      <KycView v-else-if="showKycView" @confirmKyc="redirectToView" />

      <StepsKYCPopup
        v-if="showStepsKYCPopup"
        :fillSteps="fillSteps"
        :handlerClose="closeStepsKYCPopup"
        :proceed="proceedStepsPopup"
      />

      <GetXORPopup v-if="showGetXORPopup" @openX1Form="openX1Form" :handlerClose="closeGetXORPopup" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Ref } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import type { AsyncFn, Fn } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import Preview from '@/screens/soraCard/Preview.vue';
import GetXORPopup from '@/screens/soraCard/GetXORPopup.vue';
import { StepsKyc, VerificationStatus, KycStatus } from '@/consts/soraCard';
import KycView from '@/screens/soraCard/stepsKYC/KycView.vue';
import { soraCardController } from '@/controllers';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { MutationTypes as SoraCardMutationTypes } from '@/store/soraCard/mutations';
import StepsKYCPopup from '@/screens/soraCard/stepsKYC/StepsKYCPopup.vue';
import TermsAndConditions from '@/screens/soraCard/stepsKYC/TermsAndConditions.vue';
import Phone from '@/screens/soraCard/stepsKYC/Phone.vue';
import Email from '@/screens/soraCard/stepsKYC/Email.vue';
import X1Form from '@/screens/X1/X1Form.vue';

@Component({
  components: {
    Phone,
    Email,
    X1Form,
    KycView,
    Preview,
    GetXORPopup,
    StepsKYCPopup,
    TermsAndConditions,
    UnsupportedCountries,
  },
})
export default class SoraCardPage extends Vue {
  showCountriesForm = false;
  showGetXORPopup = false;
  userApplied = false;
  showStepsKYCPopup = false;
  showX1Form = false;
  step = StepsKyc.Preview;

  @Ref('termsAndConditions') readonly termsAndConditions!: TermsAndConditions;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(SoraCardGettersTypes.currentStatus) currentStatus!: VerificationStatus;
  @Getter(SoraCardGettersTypes.wantsToPassKycAgain) wantsToPassKycAgain!: boolean;
  @Getter(SoraCardGettersTypes.hasFreeAttempts) hasFreeAttempts!: boolean;
  @Action(SoraCardActionTypes.GET_USER_STATUS) getUserStatus!: AsyncFn;
  @Mutation(SoraCardMutationTypes.SET_KYC_STATUS) setKycStatus!: Fn<KycStatus>;
  @Mutation(SoraCardMutationTypes.SET_VERIFICATION_STATUS) setVerificationStatus!: Fn<VerificationStatus>;

  get fillSteps() {
    return this.userApplied ? [2, 3] : [1];
  }

  get showPreview() {
    return this.step === StepsKyc.Preview;
  }

  get showTermsAndConditions() {
    return this.step === StepsKyc.TermsAndConditions;
  }

  get showPhone() {
    return this.step === StepsKyc.Phone;
  }

  get showEmail() {
    return this.step === StepsKyc.Email;
  }

  get showKycView() {
    return this.step === StepsKyc.KycView;
  }

  get showBackIcon() {
    return [StepsKyc.TermsAndConditions, StepsKyc.Phone, StepsKyc.Email].includes(this.step) || this.showX1Form;
  }

  get headerForm() {
    if (this.step === StepsKyc.Preview) return 'soraCard.title';

    if (this.step === StepsKyc.TermsAndConditions) {
      if (this.showCountriesForm) return 'soraCard.unsupportedCountries';

      return 'common.termsConditions';
    }

    if (this.step === StepsKyc.Phone) return 'soraCard.phoneConfirmation';

    if (this.step === StepsKyc.Email) return 'soraCard.emailConfirmation';

    if (this.step === StepsKyc.KycView) return 'soraCard.completeKYC';

    return '';
  }

  get hasTokens() {
    const accessToken = soraCardController.getPWToken();
    const refreshToken = soraCardController.getPWRefreshToken();

    if (refreshToken === 'undefined') return false;

    return !!accessToken && !!refreshToken;
  }

  mounted() {
    soraCardController.clearPayWingsKeysFromLocalStorage();

    this.checkKyc();
  }

  async checkKyc() {
    await this.getUserStatus();

    if (this.currentStatus === VerificationStatus.Rejected && this.wantsToPassKycAgain && this.hasFreeAttempts) {
      this.step = StepsKyc.KycView;

      return;
    }

    if (this.currentStatus) {
      // this.step = Step.ConfirmationInfo;

      return;
    }

    if (this.hasTokens) {
      this.step = StepsKyc.KycView;

      return;
    }

    this.step = StepsKyc.Preview;
  }

  redirectToView(success: boolean) {
    if (success) this.openStartPage(success);
    else {
      this.step = StepsKyc.Preview;
      // this.showStepsKYCPopup = true; TODO??????
    }
  }

  openStartPage(withoutCheck: boolean) {
    if (withoutCheck) {
      this.setKycStatus(KycStatus.Completed);
      this.setVerificationStatus(VerificationStatus.Pending);
      // this.step = Step.ConfirmationInfo;

      return;
    }

    this.checkKyc();
  }

  handlerBack() {
    if (this.showX1Form) this.closeX1Form();
    else if (this.showCountriesForm) this.toggleCountriesFormVisibility();
    else if (this.step === StepsKyc.Phone && this.userApplied) this.step = StepsKyc.Preview;
    else if (this.step === StepsKyc.TermsAndConditions && this.termsAndConditions?.link)
      this.termsAndConditions.link = '';
    else this.step -= 1;
  }

  closeForm() {
    if (window.history.length === 1) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }

  proceedStepsPopup() {
    this.step = StepsKyc.Phone;
    this.showStepsKYCPopup = false;
  }

  confirmPhone(step?: StepsKyc) {
    if (step === undefined) this.openStartPage(false);
    else this.step = step;
  }

  confirmEmail() {
    this.step = StepsKyc.KycView;
  }

  confirmApply(userApplied: boolean) {
    this.userApplied = userApplied;

    if (userApplied) this.showStepsKYCPopup = true;
    else this.step = StepsKyc.TermsAndConditions;
  }

  openGetXORPopup() {
    this.showGetXORPopup = true;
  }

  closeGetXORPopup() {
    this.showGetXORPopup = false;
  }

  toggleCountriesFormVisibility() {
    this.showCountriesForm = !this.showCountriesForm;
  }

  openStepsKYCPopup() {
    this.showStepsKYCPopup = true;
  }

  closeStepsKYCPopup() {
    this.showStepsKYCPopup = false;
  }

  openX1Form() {
    this.showX1Form = true;

    this.closeGetXORPopup();
  }

  closeX1Form() {
    this.showX1Form = false;
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
