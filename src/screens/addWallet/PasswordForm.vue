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
import { defineComponent } from 'vue';


export default defineComponent({ name: 'PasswordForm' ,
  props: {
    isGoogleFlow: { type: Boolean, default: false },
    showSamePasswordText: Boolean,
    focus: { type: Boolean, default: true },
  },
  data() {
    return {
      pass1: '',
      pass2: '',
    };
  },
  computed: {
    isShortPassword() {
      return this.pass1.length !== 0 && this.pass1.length < 6;
    },
    isWrongPassword() {
      return !!this.pass2.length && this.pass1 !== this.pass2;
    },
    showPasswordConfirmation() {
      return this.pass1.length !== 0 && !this.isShortPassword;
    },
    hintGoogleDriveText() {
      return this.$t('addWallet.google.dataWillStoreOnGDrive');
    },
    hintText() {
      if (this.showSamePasswordText) return this.$t('addWallet.samePassword');

          return this.$t('addWallet.passwordInfo');
    },
    pass1InputComponent() {
      return this.$refs.pass1Input;
    },
  },
  watch: {
    "pass1": 'changePassword',
    "pass2": 'confirmPassword',
  },
  mounted() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        if (this.focus) this.pass1InputComponent.input.focus();
  },
  methods: {
    changePassword(pass1: string) {
      if (pass1.length < 6) this.pass2 = '';

          this.setPassword(pass1 === this.pass2 ? pass1 : '');
    },
    confirmPassword(pass2: string) {
      this.setPassword(this.pass1 === pass2 ? pass2 : '');
    },
    setPassword(password: string) {
      this.$emit('setPassword', password);
    },
    changePass1(value: string) {
      this.pass1 = value;
    },
    changePass2(value: string) {
      this.pass2 = value;
    },
  },
});
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
