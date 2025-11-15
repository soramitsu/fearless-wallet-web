<template>
  <Popup
    v-if="currentDialog"
    :showHeader="false"
    :closeByBackground="currentDialog.type === 'alert'"
    :showCloseButton="currentDialog.type === 'alert'"
    :showBorder="false"
    sizeWidth="small"
    @handlerClose="onClose"
  >
    <div class="dialog-host">
      <h3 v-if="currentDialog.title" class="dialog-host__title">{{ currentDialog.title }}</h3>
      <p class="dialog-host__message">{{ currentDialog.message }}</p>

      <FInput v-if="currentDialog.type === 'prompt'" v-model="promptValue" size="big" data-testid="dialogHostInput" />

      <div class="dialog-host__actions">
        <FButton
          v-if="currentDialog.type === 'prompt'"
          type="secondary"
          size="medium"
          text="common.cancel"
          @click="onCancel"
        />
        <FButton
          size="medium"
          :text="currentDialog.type === 'alert' ? 'common.ok' : 'common.confirm'"
          @click="onConfirm"
        />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import FButton from '@/components/FButton.vue';
import FInput from '@/components/FInput.vue';
import { useDialogService } from '@/plugins/dialogService';

const { dialog, confirmAlert, submitPrompt, cancelPrompt } = useDialogService();
const promptValue = ref('');

const currentDialog = computed(() => dialog.value);

watch(
  currentDialog,
  (value) => {
    if (value?.type === 'prompt') promptValue.value = value.defaultValue ?? '';
  },
  { immediate: true }
);

const onConfirm = () => {
  const dialogValue = currentDialog.value;

  if (!dialogValue) return;

  if (dialogValue.type === 'alert') confirmAlert();
  else submitPrompt(promptValue.value);
};

const onCancel = () => {
  if (currentDialog.value?.type === 'prompt') cancelPrompt();
};

const onClose = () => {
  if (currentDialog.value?.type === 'alert') confirmAlert();
};
</script>

<style lang="scss" scoped>
.dialog-host {
  display: flex;
  flex-direction: column;
  gap: $default-padding;
  padding: $default-padding;
  max-width: 320px;
}

.dialog-host__title {
  margin: 0;
  font-weight: 600;
  font-size: 1.125rem;
  color: $default-white;
}

.dialog-host__message {
  margin: 0;
  color: $gray-color;
  line-height: 1.4;
  white-space: pre-line;
}

.dialog-host__actions {
  display: flex;
  justify-content: flex-end;
  gap: $default-padding;
}
</style>
