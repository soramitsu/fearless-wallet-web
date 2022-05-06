<template>
  <div class="password-form">
    <ValidatedInput
      v-model="pass1"
      errorDescriptions="Password is too short"
      placeholder="Enter password"
      :isError="isShortPassword"
      :showPassword="true"
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

    <Hint
      iconType="notification"
      text="This password protects all your wallets. Make sure you remember it and do not share it with anybody."
    />
  </div>
</template>

<script lang="ts">
import { Getter, Mutation } from 'vuex-class';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { GettersTypes } from '@/store/accounts/getters';
import { MutationTypes } from '@/store/accounts/mutations';
import Hint from '@/components/Hint.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';

@Component({
  components: { Hint, ValidatedInput },
})
export default class extends Vue {
  @Getter(GettersTypes.getPassword) getPassword!: string;
  @Mutation(MutationTypes.SET_PASSWORD) setPassword!: (props: Record<string, string>) => void;
  pass1 = '';
  pass2 = '';

  get isShortPassword() {
    return this.pass1.length !== 0 && this.pass1.length < 5;
  }

  get isWrongPassword() {
    return !!this.pass2.length && this.pass1 !== this.pass2;
  }

  get showPasswordConfirmation() {
    return this.pass1.length !== 0 && !this.isShortPassword;
  }

  @Watch('pass1')
  changePassword(pass1: string) {
    if (pass1.length < 5) this.pass2 = '';
  }

  @Watch('pass2')
  confirmPassword(pass2: string) {
    if (this.pass1 === pass2) {
      this.setPassword({ password: pass2 });

      return;
    }

    this.setPassword({ password: '' });
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
