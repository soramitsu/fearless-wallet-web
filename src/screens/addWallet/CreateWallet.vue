<template>
  <Scroll>
    <div class="create-wallet">
      <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength">
        <BorderButton
          class="copy__phrase"
          size="small"
          fontSize="small"
          borderRadius="small"
          width="186px"
          type="secondary"
          text="common.copyToClipboard"
          @click="onCopy"
        />

        <AdvancedButton v-if="isSubstrate" @click="toggleAdvancedFormVisible" />

        <Tooltip text="common.copied" target=".copy__phrase" trigger="click" :arrow="true" />
      </MnemonicBackupForm>

      <MnemonicConfirmationForm
        v-if="showMnemonicConfirmationForm"
        :mnemonicMix="mnemonicMix"
        :mnemonicLength="mnemonicLength"
        :selectedMnemonicElements="syncedSelectedMnemonicElements"
        @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      />
    </div>
  </Scroll>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { MnemonicConfirmation } from '@/interfaces/common';
import type { WordCount } from '@extension-base/services';
import MnemonicConfirmationForm from '@/screens/addWallet/MnemonicConfirmationForm.vue';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import { setClipboard } from '@/helpers';
import { shuffleArray } from '@/helpers/numbers';

defineOptions({
  name: 'CreateWallet',
});

const props = defineProps<{
  step: number;
  mnemonic: string;
  mnemonicLength: WordCount;
  isSubstrate: boolean;
  selectedMnemonicElements: MnemonicConfirmation[];
}>();

const emit = defineEmits<{
  toggleAdvancedFormVisible: [];
  'update:selectedMnemonicElements': [value: MnemonicConfirmation[]];
}>();

const syncedSelectedMnemonicElements = computed({
  get: () => props.selectedMnemonicElements,
  set: (value: MnemonicConfirmation[]) => emit('update:selectedMnemonicElements', value),
});

const mnemonicArray = computed(() => props.mnemonic.split(' '));

const mnemonicMix = computed(() => shuffleArray(mnemonicArray.value).map((word) => `${word} `));

const showMnemonicBackupForm = computed(() => props.step === 2);
const showMnemonicConfirmationForm = computed(() => props.step === 3);

const updateSelectedMnemonicElements = (value: MnemonicConfirmation[]) => {
  syncedSelectedMnemonicElements.value = value;
};

const onCopy = () => {
  setClipboard(props.mnemonic);
};

const toggleAdvancedFormVisible = () => {
  emit('toggleAdvancedFormVisible');
};
</script>

<style lang="scss" scoped>
@media (max-height: 600px) {
  .create-wallet {
    height: 315px;
  }
}

.create-wallet {
  width: 100%;
}

.copy__phrase {
  text-decoration: underline;
  cursor: pointer;
  margin: 0 auto;
}
</style>
