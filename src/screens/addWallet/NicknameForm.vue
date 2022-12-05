<template>
  <div class="nickname">
    <Input
      v-model="syncedNickname"
      placeholder="addWallet.walletNickname"
      size="big"
      :maxlength="35"
      :readonly="readonly"
      class="input"
    />

    <Hint class="hint" iconName="notification" text="addWallet.exampleNameWallet" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';

@Component
export default class NicknameForm extends Vue {
  @Prop({ default: false }) readonly!: boolean;
  @PropSync('nickname', { type: String }) syncedNickname!: string;
}
</script>

<style lang="scss" scoped>
.nickname {
  i {
    color: $plain-white;
  }

  .input {
    margin-bottom: 16px;
  }
}
</style>
