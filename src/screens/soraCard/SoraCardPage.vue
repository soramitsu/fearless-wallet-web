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

      <KycPrepare v-else-if="showKycPrepare" @openKycVieW="openKycVieW" />

      <KycView v-else-if="showKycView" @confirmKyc="redirectToView" />

      <Status v-else-if="showStatus" @openStartPage="openStartPage" @openPolkaswap="openPolkaswap" />

      <Loader v-else />

      <StepsKYCPopup
        v-if="showStepsKYCPopup"
        :fillSteps="fillSteps"
        :handlerClose="closeStepsKYCPopup"
        :proceed="proceedStepsPopup"
      />

      <GetXORPopup v-if="showGetXORPopup" :handlerClose="closeGetXORPopup" @openX1Form="openX1Form" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Ref } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types/types';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import type { AsyncFn, Fn } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import UnsupportedCountries from '@/screens/soraCard/UnsupportedCountries.vue';
import Preview from '@/screens/soraCard/Preview.vue';
import Status from '@/screens/soraCard/Status.vue';
import GetXORPopup from '@/screens/soraCard/GetXORPopup.vue';
import { StepsKyc, VerificationStatus, KycStatus } from '@/consts/soraCard';
import { soraCardController } from '@/controllers';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { MutationTypes as SoraCardMutationTypes } from '@/store/soraCard/mutations';
import StepsKYCPopup from '@/screens/soraCard/stepsKYC/StepsKYCPopup.vue';
import TermsAndConditions from '@/screens/soraCard/stepsKYC/TermsAndConditions.vue';
import KycPrepare from '@/screens/soraCard/stepsKYC/KycPrepare.vue';
import Phone from '@/screens/soraCard/stepsKYC/Phone.vue';
import Email from '@/screens/soraCard/stepsKYC/Email.vue';
import X1Form from '@/screens/X1/X1Form.vue';
import KycView from '@/screens/soraCard/stepsKYC/KycView.vue';
import { URLS } from '@/consts/urls';
import { IS_EXTENSION } from '@/consts/global';
import { updateAuthorization, approvePolkaswapAuthRequest } from '@/extension/messaging';
import { WalletInfo } from '@/store';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { subscribeCardToken } from '@/util/soraCard';

@Component({
  components: {
    Phone,
    Email,
    X1Form,
    Status,
    KycView,
    Preview,
    KycPrepare,
    GetXORPopup,
    StepsKYCPopup,
    TermsAndConditions,
    UnsupportedCountries,
  },
})
export default class SoraCardPage extends Vue {
  readonly isExtension = IS_EXTENSION;

  showCountriesForm = false;
  showGetXORPopup = false;
  userApplied = false;
  showStepsKYCPopup = false;
  showX1Form = false;
  step: StepsKyc | -1 = -1;

  @Ref('termsAndConditions') readonly termsAndConditions!: TermsAndConditions;
  @Getter(ExtensionGettersTypes.authList) authlist!: Record<string, AuthUrlInfo>;
  @Getter(AccountsGettersTypes.getWallets) wallets!: WalletInfo[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(SoraCardGettersTypes.currentStatus) currentStatus!: VerificationStatus;
  @Getter(SoraCardGettersTypes.wantsToPassKycAgain) wantsToPassKycAgain!: boolean;
  @Getter(SoraCardGettersTypes.hasFreeAttempts) hasFreeAttempts!: boolean;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Action(SoraCardActionTypes.GET_USER_STATUS) getUserStatus!: AsyncFn;
  @Action(SoraCardActionTypes.GET_USER_KYC_ATTEMPT) getUserKycAttempt!: AsyncFn;
  @Action(ExtensionActionTypes.GET_AUTHLIST) getAuthList!: AsyncFn<void>;
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

  get showKycPrepare() {
    return this.step === StepsKyc.KycPrepare;
  }

  get showKycView() {
    return this.step === StepsKyc.KycView;
  }

  get showStatus() {
    return this.step === StepsKyc.Status;
  }

  get showBackIcon() {
    return (
      [StepsKyc.TermsAndConditions, StepsKyc.Phone, StepsKyc.Email].some((el) => el === this.step) ||
      this.showX1Form ||
      this.showCountriesForm
    );
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

    if (this.step === StepsKyc.Status) return 'soraCard.cardDetails';

    if (this.step === StepsKyc.KycPrepare) return 'soraCard.getPrepared';

    return '';
  }

  get hasTokens() {
    const accessToken = soraCardController.getPWToken();
    const refreshToken = soraCardController.getPWRefreshToken();

    if (refreshToken === 'undefined') return false;

    return !!accessToken && !!refreshToken;
  }

  mounted() {
    if (this.isExtension) {
      if (!this.hasTokens) subscribeCardToken(this.checkKyc);

      this.getAuthList();
    }

    soraCardController.clearPayWingsKeysFromLocalStorage();

    this.getUserKycAttempt();
    this.checkKyc();
  }

  async checkKyc() {
    await this.getUserStatus();

    if (this.currentStatus === VerificationStatus.Rejected && this.wantsToPassKycAgain && this.hasFreeAttempts) {
      if (this.isExtension) this.openPolkaswap();
      else this.step = StepsKyc.KycView;

      return;
    }

    if (this.currentStatus) {
      this.step = StepsKyc.Status;

      return;
    }

    if (this.hasTokens) {
      if (this.isExtension) this.openPolkaswap();
      else this.step = StepsKyc.KycView;

      return;
    }

    this.step = StepsKyc.Preview;
  }

  redirectToView(success: boolean) {
    if (success) this.openStartPage(success);
    else this.step = StepsKyc.Preview;
  }

  openStartPage(withoutCheck: boolean) {
    if (withoutCheck) {
      this.setKycStatus(KycStatus.Completed);
      this.setVerificationStatus(VerificationStatus.Pending);

      this.step = StepsKyc.Status;

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
    this.step = StepsKyc.KycPrepare;
  }

  openKycVieW() {
    this.step = StepsKyc.KycView;
  }

  confirmApply(userApplied: boolean) {
    if (this.isExtension) {
      this.openPolkaswap();

      return;
    }

    this.userApplied = userApplied;

    if (userApplied) this.showStepsKYCPopup = true;

    this.step = StepsKyc.TermsAndConditions;
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

  async openPolkaswap() {
    const { POLKASWAP } = URLS;
    const { address: selectedAddress, name } = this.selectedWallet;

    const stripPolkaswap = stripUrl(POLKASWAP);
    const polkaswapAuth = this.authlist[stripPolkaswap];

    // polkaswap authorized
    if (polkaswapAuth) {
      const { authorizedAccounts } = polkaswapAuth;

      // but no current account
      if (!authorizedAccounts.includes(selectedAddress)) {
        const activeAccounts = [
          selectedAddress,
          ...this.wallets.filter(({ address }) => authorizedAccounts.includes(address)).map(({ address }) => address),
        ];

        await updateAuthorization(activeAccounts, stripPolkaswap);
      }
    } else approvePolkaswapAuthRequest([selectedAddress]);

    window.open(`${POLKASWAP}/#/card?fearless=${selectedAddress}&name=${name}`);
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
