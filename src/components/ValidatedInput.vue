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
      :describedBy="showErrorText ? errorId : undefined"
      :readonly="readonly"
      :disabled="disabled"
      :typeText="typeText"
      :type="type"
      @change="emitChange"
      @pressEnter="emitPressEnter"
    />

    <div :id="errorId" class="error-descriptions" data-testid="errorDescriptions" role="alert" aria-live="polite" aria-atomic="true">
      <Icon v-if="showErrorText && errorWithIcon" icon="warning" className="warning" />

      {{ showErrorText ? $t(errorDescriptions) : '' }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, useId } from 'vue';
import FInput from '@/components/FInput.vue';

type Type = 'text' | 'textarea' | 'text-file' | 'number' | 'email';
type TypeText = 'none' | 'uppercase';
type Size = 'small' | 'medium' | 'big';

type FInputProps = {
  errorDescriptions: string;
  placeholder: string;
  isError?: boolean;
  maxlength?: number;
  showPassword?: boolean;
  readonly?: boolean;
  typeText?: TypeText;
  type?: Type;
  disabled?: boolean;
  size?: Size;
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

const emit = defineEmits(['change', 'pressEnter']);

const emitChange = (value: string | number) => emit('change', value);
const emitPressEnter = () => emit('pressEnter');

const errorId = useId();
const inputRef = ref<InstanceType<typeof FInput> | null>(null);

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
    &:empty { display: none; }
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    font-size: 0.875em;
    color: $fw-validation-label;
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
