<template>
  <div class="password-form">
    <ValidatedInput
      v-model="pass1"
      errorDescriptions="addWallet.shortPassword"
      placeholder="addWallet.enterPassword"
      ref="pass1Input"
      :isError="isShortPassword"
      :showPassword="true"
      :readonly="showMockPassword"
      class="row"
    />

    <ValidatedInput
      v-show="showPasswordConfirmation"
      v-model="pass2"
      errorDescriptions="addWallet.notMatchPassword"
      placeholder="addWallet.reEnterPassword"
      :isError="isWrongPassword"
      :showPassword="true"
      class="row"
    />

    <Hint class="hint" iconName="notification" :text="hintText" />
    <Hint v-if="isGoogleFlow" class="hint" iconName="notification" :text="hintGoogleDriveText" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop, Ref } from 'vue-property-decorator';
import type ValidatedInput from '@/components/ValidatedInput.vue';

@Component
export default class PasswordForm extends Vue {
  pass1 = '';
  pass2 = '';

  @Ref('pass1Input') readonly pass1InputComponent!: ValidatedInput;
  @Prop(Boolean) showMockPassword!: boolean;
  @Prop({ type: Boolean, default: false }) isGoogleFlow!: boolean;
  @Prop(Boolean) showSamePasswordText!: boolean;

  get isShortPassword() {
    return this.pass1.length !== 0 && this.pass1.length < 6;
  }

  get isWrongPassword() {
    return !!this.pass2.length && this.pass1 !== this.pass2;
  }

  get showPasswordConfirmation() {
    return !this.showMockPassword && this.pass1.length !== 0 && !this.isShortPassword;
  }

  get hintGoogleDriveText() {
    return this.$t('addWallet.google.dataWillStoreOnGDrive');
  }

  get hintText() {
    if (this.showMockPassword) return this.$t('addWallet.mockPassword');

    if (this.showSamePasswordText) return this.$t('addWallet.samePassword');

    return this.$t('addWallet.passwordInfo');
  }

  mounted() {
    this.pass1InputComponent.input.focus();

    if (this.showMockPassword) this.pass1 = '000000';
  }

  @Watch('pass1')
  changePassword(pass1: string) {
    if (pass1.length < 6) this.pass2 = '';
    else if (pass1 === this.pass2) this.setPassword(pass1);
  }

  @Watch('pass2')
  confirmPassword(pass2: string) {
    if (this.pass1 === pass2) {
      this.setPassword(pass2);

      return;
    }

    this.setPassword('');
  }

  setPassword(password: string) {
    this.$emit('updateWalletPassword', password);
  }
}
</script>

<style lang="scss" scoped>
.password-form {
  .row {
    margin-bottom: 14px;
  }

  .hint {
    margin-top: 10px;
  }
}
</style>
