<template>
  <div class="validate-input">
    <FInput
      :value="value"
      ref="inputRef"
      data-testid="input"
      :size="size"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :showPassword="showPassword"
      :isError="isError"
      :readonly="readonly"
      :disabled="disabled"
      :typeText="typeText"
      :type="type"
      @change="emitChange"
    />

    <div v-show="showErrorText" class="error-descriptions" data-testid="errorDescriptions">
      <Icon v-if="errorWithIcon" icon="warning" className="warning" />

      {{ $t(errorDescriptions) }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, withDefaults } from 'vue';
import FInput from '@/components/FInput.vue';

type Type = 'text' | 'textarea' | 'text-file' | 'number' | 'email';

type FInputProps = {
  errorDescriptions: string;
  placeholder: string;
  isError: boolean;
  maxlength?: number;
  showPassword?: boolean;
  readonly?: boolean;
  typeText?: string;
  type?: Type;
  disabled?: boolean;
  size?: string;
  errorWithIcon?: boolean;
  value: string;
};

const props = withDefaults(defineProps<FInputProps>(), {
  errorDescriptions: '',
  isError: false,
  value: '',
  placeholder: '',
  accept: '',
  size: 'big',
  type: 'text',
  typeText: 'none',
  maxlength: 50,
  readonly: false,
  disabled: false,
  showPassword: false,
  styleInput: 'default',
  errorWithIcon: false,
  cursorPointer: false,
});

const emit = defineEmits(['change']);

const emitChange = (value: string | number) => {
  emit('change', value);
};

const inputRef = ref<typeof FInput | null>(null);

const showErrorText = computed(() => props.isError && props.errorDescriptions);
const input = computed(() => inputRef.value?.input as HTMLInputElement);

defineExpose({ input });
</script>

<style lang="scss" scoped>
.validate-input {
  i {
    color: $plain-white;
  }

  .error-descriptions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    color: #ee7700;
    text-align: left;
    margin-top: 15px;
  }

  .warning {
    color: #ee7700;
    width: 16px;
    min-width: 16px;
    height: 16px;
  }
}
</style>
