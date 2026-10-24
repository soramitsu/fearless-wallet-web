<template>
  <FCorners size="big" :isError="showError" :isSelected="isFocused" class="recipient-input">
    <div class="input input-style-default input-size-big">
      <label class="s-placeholder" :for="inputId">{{ $t('assets.sendTo') }}</label>

      <input
        :id="inputId"
        :value="value"
        :class="['el-input__inner', 'recipient-value', { 'error-input': showError }]"
        type="text"
        :placeholder="$t('assets.walletAddress')"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :aria-invalid="showError"
        data-testid="sendToInput"
        @input="onInput"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

      <button
        v-if="value !== ''"
        type="button"
        class="recipient-clear"
        :aria-label="$t('common.delete')"
        data-testid="clearRecipient"
        @click="emit('update', '')"
      >
        <Icon icon="close" width="15px" height="15px" />
      </button>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, ref, useId } from 'vue';

interface Props {
  value: string;
  isError?: boolean;
}

const props = withDefaults(defineProps<Props>(), { value: '', isError: false });

const emit = defineEmits<{ update: [value: string] }>();

const inputId = useId();
const isFocused = ref(false);

// An address is flagged once the field is left, not while it is still being typed.
const showError = computed(() => props.isError && !isFocused.value);

const onInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  // Addresses never contain whitespace, and a copied one often brings a space or a line break along.
  const address = input.value.replace(/\s+/g, '');

  if (address !== input.value) input.value = address;

  emit('update', address);
};
</script>

<style lang="scss" scoped>
.recipient-input .input {
  position: relative;
}

// More specific than the shared field rules, which also use !important: the text must stop short of the clear
// button, and a whole EVM or Substrate address fits on one line at this size.
.recipient-input .input .recipient-value {
  padding-right: 44px !important;
  font-size: 0.875em !important;
  text-overflow: ellipsis;

  &:focus {
    border-color: $purple-color !important;
  }
}

// Spans the text line under the label, so the button sits level with the address.
.recipient-clear {
  position: absolute;
  top: 15px;
  right: 4px;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: $gray-color;
  cursor: pointer;

  &:hover {
    color: $plain-white;
  }
}
</style>
