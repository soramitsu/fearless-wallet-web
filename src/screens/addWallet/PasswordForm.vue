<template>
  <div class="password-form">
    <ValidatedInput
      ref="pass1Input"
      data-testid="enterPasswordInput"
      class="row"
      :value="pass1"
      :errorDescriptions="$t('addWallet.shortPassword')"
      :placeholder="$t('welcome.newPassword')"
      :isError="isShortPassword"
      :showPassword="true"
      @change="changePass1"
    />

    <ValidatedInput
      v-show="showPasswordConfirmation"
      data-testid="reEnterPasswordInput"
      class="row"
      :value="pass2"
      :errorDescriptions="$t('addWallet.notMatchPassword')"
      :placeholder="$t('welcome.reenterNewPassword')"
      :isError="isWrongPassword"
      :showPassword="true"
      @change="changePass2"
    />

    <Hint class="hint" iconName="notification" :text="hintText" data-testid="hintText" />

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
  @Prop({ type: Boolean, default: false }) isGoogleFlow!: boolean;
  @Prop(Boolean) showSamePasswordText!: boolean;
  @Prop({ type: Boolean, default: true }) focus!: boolean;

  get isShortPassword() {
    return this.pass1.length !== 0 && this.pass1.length < 6;
  }

  get isWrongPassword() {
    return !!this.pass2.length && this.pass1 !== this.pass2;
  }

  get showPasswordConfirmation() {
    return this.pass1.length !== 0 && !this.isShortPassword;
  }

  get hintGoogleDriveText() {
    return this.$t('addWallet.google.dataWillStoreOnGDrive');
  }

  get hintText() {
    if (this.showSamePasswordText) return this.$t('addWallet.samePassword');

    return this.$t('addWallet.passwordInfo');
  }

  mounted() {
    if (this.focus)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      this.pass1InputComponent.input.focus();
  }

  @Watch('pass1')
  changePassword(pass1: string) {
    if (pass1.length < 6) this.pass2 = '';

    this.setPassword(pass1 === this.pass2 ? pass1 : '');
  }

  @Watch('pass2')
  confirmPassword(pass2: string) {
    this.setPassword(this.pass1 === pass2 ? pass2 : '');
  }

  setPassword(password: string) {
    this.$emit('setPassword', password);
  }

  changePass1(value: string) {
    this.pass1 = value;
  }

  changePass2(value: string) {
    this.pass2 = value;
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
