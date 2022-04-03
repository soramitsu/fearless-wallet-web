<template>
  <div class="password-form">
    <s-input v-model="password" size="big" placeholder="Enter password" maxlength="25" class="input" show-password />
    <s-input
      v-show="showPasswordСonfirmation"
      v-model="passwordConfirmation"
      size="big"
      placeholder="Re-Enter password"
      maxlength="25"
      class="input"
      show-password
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
import { GettersTypes } from '../../store/accounts/getters';
import { MutationTypes } from '../../store/accounts/mutations';
import Hint from '../Hint.vue';

@Component({ components: { Hint } })
export default class extends Vue {
  @Getter(GettersTypes.getPassword) getPassword!: string;
  @Mutation(MutationTypes.SET_PASSWORD) setPassword: any;
  password = '';
  passwordConfirmation = '';

  get showPasswordСonfirmation(): boolean {
    return !!this.password;
  }

  @Watch('password')
  changePassword() {
    this.passwordConfirmation = '';
  }

  @Watch('passwordConfirmation')
  confirmPassword(password: string) {
    if (this.password === password) {
      this.setPassword({ password });
    } else {
      this.setPassword({ password: '' });
    }
  }
}
</script>

<style lang="scss" scoped>
.password-form {
  i {
    color: #ffffff;
  }

  .input {
    font-size: 24px;
    margin-top: 15px;
  }
}
</style>
