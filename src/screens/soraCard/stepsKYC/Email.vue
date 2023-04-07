<template>
  <div class="email-confirmation">
    <VerifyEmailForm v-if="showVerifyEmailForm" :email="email" />

    <div v-else>
      <ValidatedInput
        v-model="email"
        placeholder="common.email"
        errorDescriptions="soraCard.invalidEmail"
        type="email"
        :maxlength="320"
        :isError="isErrorEmail"
      />

      <Hint iconName="notification" text="soraCard.wellSendEmail" class="hint" />

      <template v-if="showNameInputs">
        <Input v-model="firstName" placeholder="soraCard.firstName" size="big" :maxlength="50" />

        <Input v-model="lastName" placeholder="soraCard.lastName" size="big" class="last-name" :maxlength="50" />

        <Hint iconName="notification" text="soraCard.useRealName" class="hint" />
      </template>

      <Disclaimer />
    </div>

    <Button
      :text="textBtnSend"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      :disabled="sendBtnDisabled"
      @click="sendEmail"
    />

    <Button
      v-show="showVerifyEmailForm"
      text="soraCard.useAnotherEmail"
      width="100%"
      size="big"
      fontSize="big"
      type="secondary"
      class="back-btn"
      :border="false"
      @click="closeVerifyEmailForm"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validateEmail } from '@/helpers/common';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { RESEND_INTERVAL } from '@/consts/soraCard';
import { soraCardController } from '@/controllers';
import VerifyEmailForm from '@/screens/soraCard/stepsKYC/VerifyEmailForm.vue';

@Component({
  components: {
    Disclaimer,
    VerifyEmailForm,
  },
})
export default class Email extends Vue {
  email = '';
  firstName = '';
  lastName = '';
  unconfirmedEmail = '';
  prefilledEmail = '';
  leftTimeForResend = 0;
  emailSent = false;
  emailSentFirstTime = false;
  showVerifyEmailForm = false;

  @Getter(SoraCardGettersTypes.authLogin) authLogin!: any;

  get textBtnSend() {
    if (this.emailSent) {
      const text = this.showVerifyEmailForm ? 'soraCard.resend' : 'soraCard.sendIn';

      return `${this.$t(text)} 0:${this.leftTimeForResend < 10 ? '0' : ''}${this.leftTimeForResend}`;
    }

    return 'soraCard.sendVerificationEmail';
  }

  get isEmailValid() {
    return validateEmail(this.email);
  }

  get isPrefilledEmailValid(): boolean {
    return validateEmail(this.prefilledEmail);
  }

  get showNameInputs(): boolean {
    return this.prefilledEmail === 'undefined' || this.prefilledEmail === '';
  }

  get sendBtnDisabled() {
    if (this.emailSent) return true;

    if (this.isPrefilledEmailValid) return !this.isEmailValid;

    return this.firstName === '' || this.lastName === '' || !this.isEmailValid;
  }

  get isErrorEmail() {
    return this.email !== '' && !this.isEmailValid;
  }

  get isEmailMismatch() {
    if (this.unconfirmedEmail === '') return false;

    return this.unconfirmedEmail !== this.email;
  }

  mounted() {
    this.prefilledEmail = soraCardController.getPWEmail();

    if (this.prefilledEmail !== 'undefined') this.email = this.prefilledEmail;

    if (!this.authLogin) return;

    this.authLogin.on('Email-verified', () => {
      this.unconfirmedEmail = '';
      this.$emit('proceed');
    });
  }

  closeVerifyEmailForm() {
    this.showVerifyEmailForm = false;
  }

  sendEmail() {
    this.startInterval();

    // user wants to change unconfirmed email
    if ((this.isPrefilledEmailValid && this.prefilledEmail !== this.email) || this.isEmailMismatch) {
      this.authLogin.ChangeUnconfirmedEmail({ Email: this.email }).catch((error: string) => {
        console.error('[SoraCard]: Error while changing email', error);
      });

      this.unconfirmedEmail = this.email;
      this.emailSent = true;
      this.showVerifyEmailForm = true;

      return;
    }

    // user signs on for the first time
    if (!this.emailSentFirstTime && !this.isPrefilledEmailValid) {
      this.authLogin
        .UserMinimalRegistration({
          Email: this.email,
          FirstName: this.firstName,
          LastName: this.lastName,
        })
        .catch((error: string) => {
          console.error('[SoraCard]: Error while email setup', error);
        });

      this.unconfirmedEmail = this.email;
      this.emailSent = true;
      this.showVerifyEmailForm = true;
      this.emailSentFirstTime = true;

      return;
    }

    // user tries to resend email several times
    this.authLogin.SendVerificationEmail().catch((error: string) => {
      console.error('[SoraCard]: Error while resending email', error);
    });

    this.emailSent = true;
    this.showVerifyEmailForm = true;
  }

  startInterval() {
    this.leftTimeForResend = RESEND_INTERVAL;

    const interval = setInterval(() => {
      this.leftTimeForResend -= 1;

      if (this.leftTimeForResend === 0) {
        this.emailSent = false;

        clearInterval(interval!);
      }
    }, 1000);
  }
}
</script>

<style scoped lang="scss">
.email-confirmation {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .last-name {
    margin-top: 10px;
  }

  .hint {
    margin: 15px 0 15px 16px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .back-btn {
    margin-top: 10px;
  }
}
</style>
