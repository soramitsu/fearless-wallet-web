<template>
  <div class="password-form">
    <ValidatedInput
      v-model="pass1"
      :errorDescriptions="t('shortPassword')"
      :placeholder="t('enterPassword')"
      :isError="isShortPassword"
      :showPassword="true"
      class="row"
    />

    <ValidatedInput
      v-show="showPasswordConfirmation"
      v-model="pass2"
      :errorDescriptions="t('notMatchPassword')"
      :placeholder="t('reEnterPassword')"
      :isError="isWrongPassword"
      :showPassword="true"
      class="row"
    />

    <Hint class="hint" iconName="notification" :text="hintText" />
    <Hint v-if="isGoogleFlow" class="hint" iconName="notification" :text="hintGoogleDriveText" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';

@Component
export default class PasswordForm extends Vue {
  pass1 = '';
  pass2 = '';

  @Prop({ type: Boolean, default: false }) isGoogleFlow!: boolean;
  @Prop(Boolean) showSamePasswordText!: boolean;

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
    return this.t('google.dataWillStoreOnGDrive');
  }

  get hintText() {
    if (this.showSamePasswordText) return this.t('samePassword');

    return this.t('passwordInfo');
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

  t(value: string, obj: Record<string, string> = {}) {
    return this.$t(`addWallet.${value}`, obj);
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
