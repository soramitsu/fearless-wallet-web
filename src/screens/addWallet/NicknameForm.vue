<template>
  <div class="nickname">
    <FInput
      v-model="syncedNickname"
      ref="nicknameInput"
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
import { Component, Vue, Prop, PropSync, Ref } from 'vue-property-decorator';
import type Input from '@/components/Input.vue';

@Component
export default class NicknameForm extends Vue {
  @Ref('nicknameInput') readonly nicknameInputComponent!: Input;
  @Prop({ default: false }) readonly!: boolean;
  @PropSync('nickname', { type: String }) syncedNickname!: string;

  mounted() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    this.nicknameInputComponent.input.focus();
  }
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
