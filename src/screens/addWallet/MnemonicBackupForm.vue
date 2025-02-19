<template>
  <div class="mnemonic-backup-form">
    <Hint class="seed-hint" iconName="warning" text="addWallet.backupNonDigital" />

    <MnemonicColumns :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength" />

    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
import MnemonicColumns from './MnemonicColumns.vue';
import type { WordCount } from '@extension-base/services';

type Props = {
  mnemonicArray: string[];
  mnemonicLength: WordCount;
};

defineProps<Props>();
</script>

<style lang="scss" scoped>
.mnemonic-backup-form {
  display: flex;
  flex-flow: column;
  gap: 10px;
}

.seed-hint {
  border-radius: $default-border-radius;
  width: 480px;
  padding: 8px 16px;
  background-color: rgba(255, 255, 255, 0.24);
  margin: 0 auto;
}

.fw-web {
  width: 100%;
}
</style>
