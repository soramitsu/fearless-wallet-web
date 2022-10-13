<template>
  <div class="password-form">
    <ValidatedInput
      v-model="pass1"
      errorDescriptions="Password is too short"
      placeholder="Enter password"
      :isError="isShortPassword"
      :showPassword="true"
      :readonly="showMockPassword"
      :maxlength="25"
      class="row"
    />

    <ValidatedInput
      v-show="showPasswordConfirmation"
      v-model="pass2"
      errorDescriptions="Passwords do not match"
      placeholder="Re-Enter password"
      :isError="isWrongPassword"
      :showPassword="true"
      :maxlength="25"
      class="row"
    />

    <Hint iconName="notification" :text="hintText" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
import Hint from '@/components/Hint.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import { MOCK_PASSWORD, PASSWORD_INFO, PASSWORD_SAME } from '@/consts/messages';

@Component({
  components: { Hint, ValidatedInput },
})
export default class PasswordForm extends Vue {
  pass1 = '';
  pass2 = '';

  @Prop(Boolean) showMockPassword!: boolean;
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

  get hintText() {
    if (this.showMockPassword) return MOCK_PASSWORD;

    if (this.showSamePasswordText) return PASSWORD_SAME;

    return PASSWORD_INFO;
  }

  mounted() {
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
}
</style>
