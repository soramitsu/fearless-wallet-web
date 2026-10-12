<template>
  <FCorners :isError="isError" :size="size" :class="wrapperClasses">
    <div :class="containerInputClasses" spellcheck="false">
      <label :for="inputId" class="s-placeholder">{{ $t(placeholder) }}</label>
      <textarea
        v-if="type === 'textarea'"
        v-model="vModel"
        ref="input"
        :id="inputId"
        :aria-invalid="isError || undefined"
        :aria-describedby="describedBy || undefined"
        :class="['el-input__inner', inputClasses]"
        :maxlength="maxlength"
        :readonly="readonly"
        :disabled="disabled"
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @keydown="keydownPress"
      />
      <input
        v-else
        v-model="vModel"
        ref="input"
        :id="inputId"
        :aria-invalid="isError || undefined"
        :aria-describedby="describedBy || undefined"
        :class="['el-input__inner', inputClasses]"
        :type="showPassword ? 'password' : type === 'text-file' ? 'file' : type"
        :accept="accept"
        :maxlength="maxlength"
        :readonly="readonly"
        :disabled="disabled"
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @keydown="keydownPress"
      />
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { ref, computed, useId } from 'vue';

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
  describedBy?: string;
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
const inputId = useId();

const vModel = computed({
  get: () => props.value,
  set: (value: string | number) => emit('change', value),
});

const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

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

const keydownPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) emit('pressEnter');
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
    border: 1px solid palette($default-background-color, var(--fw-stroke-control)) !important;
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

@include v1-palette {
  .input {
    .s-placeholder {
      position: static;
      text-align: left;
      font-size: 0.8125rem;
      line-height: 1.4;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--fw-text-2) !important;
    }
    .el-input__inner {
      box-sizing: border-box;
      color: var(--fw-text-1) !important;
      background: var(--fw-sunken) !important;
      border-radius: 12px;
      clip-path: none;
      padding: 12px 16px !important;
      line-height: 1.4;
      box-shadow:
        inset 2px 2px 6px rgb(0 0 0 / 0.55),
        inset -1px -1px 2px rgb(255 255 255 / 0.05);
      &:focus-visible {
        border-color: var(--fw-focus) !important;
        outline: 2px solid var(--fw-focus);
        outline-offset: -2px;
      }
      &[aria-invalid='true'] {
        border: 2px solid var(--fw-danger) !important;
        &:focus-visible {
          outline-offset: 2px;
        }
      }
    }
  }
  .fw-calm .input .el-input__inner,
  html[data-fw-effects='reduced'] .input .el-input__inner {
    box-shadow: none;
  }
}
</style>
