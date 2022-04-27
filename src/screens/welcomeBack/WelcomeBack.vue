<template>
  <div class="welcome-back">
    <div class="text">Welcome back!</div>
    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="Incorrect password"
        placeholder="Enter password"
        :isError="isError"
        :showPassword="true"
        :maxlength="25"
      />

      <Button text="Unlock" size="big" class="button" :disabled="disabled" @click="unlock" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import AccountController from '@/controllers/accountController';
import { Components } from '@/router/routes';
import ValidatedInput from '@/components/ValidatedInput.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    ValidatedInput,
    Button,
  },
})
export default class extends Vue {
  accountController = new AccountController();
  password = '';
  isError = false;

  get disabled() {
    return this.password.length === 0;
  }

  @Watch('password')
  passwordChange() {
    this.isError = false;
  }

  unlock() {
    if (this.accountController.isSamePassword(this.password)) {
      this.accountController.updatedPasswordDateCreated();
      this.$router.push({ name: Components.Wallet });
    } else {
      this.isError = true;
    }
  }
}
</script>

<style lang="scss" scoped>
.welcome-back {
  height: 100%;

  .text {
    font-size: 25px;
  }

  .input {
    margin: 10px 0;
  }

  .button {
    width: 100%;
  }
}
</style>
