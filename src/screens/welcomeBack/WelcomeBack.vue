<template>
  <div class="welcome-back">
    <div class="text">Welcome back!</div>
    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="Incorrect password"
        placeholder="Enter password"
        :isError="isError"
        :maxlength="25"
      />

      <s-button class="button" type="primary" border-radius="mini" :disabled="disabled" @click="unlock">
        Unlock
      </s-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import AccountController from '@/controllers/accountController';
import ValidatedInput from '@/components/ValidatedInput.vue';
import { Components } from '@/router/routes';

@Component({
  components: { ValidatedInput },
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
