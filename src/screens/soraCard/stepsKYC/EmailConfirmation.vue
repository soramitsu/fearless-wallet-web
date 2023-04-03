<template>
  <div class="phone-confirmation">
    <ValidatedInput
      v-model="email"
      placeholder="common.email"
      errorDescriptions="soraCard.invalidEmail"
      :isError="isErrorEmail"
    />

    <Hint iconName="notification" text="soraCard.wellSendEmail" class="hint" />

    <Input v-model="firstName" placeholder="soraCard.firstName" size="big" />

    <Input v-model="lastName" placeholder="soraCard.lastName" size="big" class="last-name" />

    <Hint iconName="notification" text="soraCard.useRealName" class="hint" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { validateEmail } from '@/helpers/common';

@Component
export default class EmailConfirmation extends Vue {
  email = '';
  firstName = '';
  lastName = '';

  get isValidEmail() {
    return validateEmail(this.email);
  }

  get isErrorEmail() {
    return this.email !== '' && !this.isValidEmail;
  }

  @Watch('email')
  @Watch('firstName')
  @Watch('lastName')
  validateWatcher() {
    const isValidForm = this.firstName !== '' && this.lastName !== '' && this.isValidEmail;

    this.$emit('toggleIsValidEmailForm', isValidForm);
  }
}
</script>

<style scoped lang="scss">
.phone-confirmation {
  display: flex;
  flex-direction: column;

  .last-name {
    margin-top: 10px;
  }

  .hint {
    margin: 15px 0 15px 16px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
