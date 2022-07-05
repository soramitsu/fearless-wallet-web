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

      <BorderButton text="Unlock" size="big" class="button" :disabled="disabled" @click="unlock" />
    </div>
  </div>
</template>

<script lang="ts">
import ValidatedInput from '@/components/ValidatedInput.vue';
import BorderButton from '@/components/BorderButton.vue';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { accountController } from '@/controllers/accountController';

@Component({
  components: {
    ValidatedInput,
    BorderButton,
  },
})
export default class WelcomeBack extends Vue {
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
    if (accountController.isSamePassword(this.password)) {
      accountController.updatedPasswordDateCreated();
      this.$router.push({ name: Components.Wallet });
    } else {
      this.isError = true;
    }
  }
}
</script>

<style lang="scss" scoped>
.welcome-back {
  height: $default-height-page;

  .text {
    font-size: 25px;
    margin-bottom: 15px;
  }

  .input {
    margin: 10px 0;
  }

  .button {
    margin-top: 15px;
    width: 100%;
  }
}
</style>
