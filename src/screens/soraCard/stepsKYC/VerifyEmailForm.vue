<template>
  <div class="verify-email">
    <Icon icon="gmail" class="gmail-icon" />

    <div class="sent-text">{{ $t('soraCard.emailSent') }}</div>
    <div class="email">{{ email }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class VerifyEmailForm extends Vue {
  @Prop(String) email!: string;
}
</script>

<style scoped lang="scss">
.verify-email {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;

  .gmail-icon {
    width: 80px;
    height: 80px;
  }

  .sent-text {
    margin-top: 40px;
    font-size: 20px;
    color: $default-white;
  }

  .email {
    font-size: 20px;
    color: $plain-white;
  }
}
</style>
