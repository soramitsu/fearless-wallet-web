<template>
  <FCorners :isError="isError" :size="size" :class="wrapperClasses">
    <div :class="containerInputClasses" spellcheck="false">
      <label class="s-placeholder">{{ $t(placeholder) }}</label>
      <textarea
        v-if="type === 'textarea'"
        v-model="vModel"
        ref="input"
        :class="['el-input__inner', inputClasses]"
        :maxlength="maxlength"
        :readonly="readonly"
        :disabled="disabled"
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @input="$emit('change', vModel)"
        @keydown="keydownPress"
      />
      <input
        v-else
        v-model="vModel"
        ref="input"
        :class="['el-input__inner', inputClasses]"
        :type="showPassword ? 'password' : type === 'text-file' ? 'file' : type"
        :accept="accept"
        :maxlength="maxlength"
        :readonly="readonly"
        :disabled="disabled"
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @input="$emit('change', vModel)"
        @keydown="keydownPress"
      />
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';

type Size = 'small' | 'medium' | 'big';
type Type = 'text' | 'textarea' | 'text-file' | 'number' | 'email';
type Style = 'default' | 'pink';
type TypeText = 'none' | 'uppercase';

type FInputProps = {
  value: string | number;
  placeholder: string;
  accept?: string;
  height?: number;
  size?: Size;
  type?: Type;
  typeText?: TypeText;
  maxlength?: number;
  readonly?: boolean;
  disabled?: boolean;
  showPassword?: boolean;
  styleInput?: Style;
  isError?: boolean;
  cursorPointer?: boolean;
};

const props = withDefaults(defineProps<FInputProps>(), {
  value: '',
  placeholder: '',
  accept: '',
  size: 'medium',
  type: 'text',
  typeText: 'none',
  maxlength: 999,
  readonly: false,
  disabled: false,
  showPassword: false,
  styleInput: 'default',
  isError: false,
  cursorPointer: false,
});

const wrapperClasses = computed(() => {
  return [
    {
      'cursor-pointer': props.cursorPointer,
    },
  ];
});

const emit = defineEmits(['blur', 'change', 'pressEnter']);

const vModel = computed({
  get: () => props.value,
  set: (value: string | number) => emit('change', value),
});

const input = ref<HTMLInputElement | null>(null);

const containerInputClasses = computed(() => {
  // for "small" and "mini" sizes also medium
  const sizeName = props.size === 'big' ? 'big' : 'medium';

  return ['input', `input-style-${props.styleInput}`, `input-size-${sizeName}`];
});

const inputStyle = computed(() => {
  const styles: Record<string, string> = {
    'text-transform': props.typeText,
  };

  if (props.height) styles.height = `${props.height}px`;

  return styles;
});

const inputClasses = computed(() => {
  return [
    {
      'error-input': props.isError,
    },
  ];
});

const keydownPress = (event: Event) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  if (event.key === 'Enter') emit('pressEnter');
};

defineExpose({ input });
</script>

<style lang="scss">
.cursor-pointer {
  .el-input__inner {
    &:hover {
      cursor: pointer;
    }
  }

  &:hover {
    cursor: pointer;
  }
}
</style>

<style lang="scss">
.input {
  position: relative;

  .el-input__inner {
    width: 100%;
    min-height: 48px;
    border: 1px solid $default-background-color !important;
    padding-left: 25px !important;
    padding-right: 16px !important;
    outline: none;
  }

  .el-input__inner {
    font-size: 1em !important;
  }

  .s-placeholder {
    display: block;
    position: absolute;
    top: 7px;
    left: 25px;
    z-index: 1;
    font-size: 0.75rem;
    color: $default-white !important;
  }

  .s-placeholder + .el-input__inner {
    padding-top: 15px !important;
  }

  .error-input {
    border: 1px solid $simple-orange-color !important;
  }
}

.input-style-default {
  textarea,
  input {
    color: $pink-lavender-color !important;
  }

  .el-input__inner {
    background-color: $secondary-background-color !important;
  }
}

.input-style-pink {
  textarea,
  input {
    color: $plain-white !important;
  }

  .el-input__inner {
    background-color: $pink-purple-color !important;
  }
}

.input-size-big {
  .el-input__inner {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.input-size-medium {
  .el-input__inner {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
