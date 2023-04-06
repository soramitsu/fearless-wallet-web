<template>
  <div class="email-confirmation">
    <div>
      <ValidatedInput
        v-model="email"
        placeholder="common.email"
        errorDescriptions="soraCard.invalidEmail"
        type="email"
        :isError="isErrorEmail"
        :maxlength="320"
      />

      <Hint iconName="notification" text="soraCard.wellSendEmail" class="hint" />

      <Input v-model="firstName" placeholder="soraCard.firstName" size="big" :maxlength="50" />

      <Input v-model="lastName" placeholder="soraCard.lastName" size="big" class="last-name" :maxlength="50" />

      <Hint iconName="notification" text="soraCard.useRealName" class="hint" />

      <Disclaimer />
    </div>

    <Button
      text="soraCard.sendVerificationEmail"
      width="100%"
      size="big"
      fontSize="big"
      :border="false"
      :disabled="!isValidForm"
      :loading="verifyEmailBtnLoading"
      @click="verifyEmail"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validateEmail } from '@/helpers/common';
import Disclaimer from '@/screens/soraCard/stepsKYC/Disclaimer.vue';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';

@Component({
  components: { Disclaimer },
})
export default class Email extends Vue {
  email = '';
  firstName = '';
  lastName = '';
  verifyEmailBtnLoading = false;

  @Getter(SoraCardGettersTypes.authLogin) authLogin!: any;

  get isValidEmail() {
    return validateEmail(this.email);
  }

  get isValidForm() {
    return this.firstName !== '' && this.lastName !== '' && this.isValidEmail;
  }

  get isErrorEmail() {
    return this.email !== '' && !this.isValidEmail;
  }

  verifyEmail(): void {
    // this.authLogin
    //   .PayWingsOtpCredentialVerification(this.otpCode)
    //   .then(() => this.$emit('proceed'))
    //   .catch((error: string) => {
    //     this.verifyEmailBtnLoading = false;
    //     this.otpCode = '';

    //     console.error('[SoraCard]: Auth', error);
    //   });

    this.verifyEmailBtnLoading = true;
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
}
</style>
