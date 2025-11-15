<template>
  <div class="mnemonic-confirmation-form">
    <div class="warning">
      {{ $t('addWallet.securityWritten') }}
    </div>

    <MnemonicColumns :mnemonicArray="selectedMnemonicArray" :mnemonicLength="mnemonicLength" />

    <div class="hint">{{ $t('addWallet.selectPassphraseWords') }}</div>

    <div class="words">
      <BorderButton
        v-for="(mnemonicElement, index) in mnemonicMix"
        size="small"
        fontSize="small"
        borderRadius="mini"
        :key="index"
        :text="mnemonicElement"
        :class="addButtonClasses(mnemonicElement, index)"
        data-testid="wordBtn"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MnemonicColumns from './MnemonicColumns.vue';
import type { MnemonicConfirmation } from '@/interfaces/common';
import type { WordCount } from '@extension-base/services';

defineOptions({
  name: 'MnemonicConfirmationForm',
});

const props = defineProps<{
  mnemonicMix: string[];
  mnemonicLength: WordCount;
  selectedMnemonicElements: MnemonicConfirmation[];
}>();

const emit = defineEmits<{
  'update:selectedMnemonicElements': [value: MnemonicConfirmation[]];
}>();

const syncedSelectedMnemonicElements = computed({
  get: () => props.selectedMnemonicElements,
  set: (value: MnemonicConfirmation[]) => emit('update:selectedMnemonicElements', value),
});

const selectedMnemonicArray = computed(() => syncedSelectedMnemonicElements.value.map(({ word }) => word));

const addButtonClasses = (word: string, index: number) => {
  const findIndex = syncedSelectedMnemonicElements.value.findIndex(
    ({ word: candidate, initialIndex }) => candidate === word && initialIndex === index
  );

  return [
    'button-mnemonic',
    {
      'inactive-button': findIndex !== -1,
    },
  ];
};

const updateSelectedMnemonicElements = (word: string, index: number) => {
  const exists = syncedSelectedMnemonicElements.value.some(
    ({ word: candidate, initialIndex }) => candidate === word && initialIndex === index
  );

  if (exists) return;

  syncedSelectedMnemonicElements.value = [...syncedSelectedMnemonicElements.value, { word, initialIndex: index }];
};
</script>

<style lang="scss" scoped>
.mnemonic-confirmation-form {
  .hint {
    margin: 7px 0;
  }

  .words {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .warning {
    height: 48px;
    line-height: 170%;
  }

  .button-mnemonic {
    margin: 4px 4px 4px 0;
    flex: 1 1 60px;

    span {
      font-weight: 400;
    }
  }

  .inactive-button {
    opacity: 0.2;
  }
}
</style>
