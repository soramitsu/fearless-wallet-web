<template>
  <FCorners :isError="isError" :size="size" :class="wrapperClasses">
    <div :class="containerInputClasses" spellcheck="false">
      <SInput
        v-model="vModel"
        ref="input"
        :class="inputClasses"
        :type="type"
        :accept="accept"
        :placeholder="$t(placeholder)"
        :size="size"
        :maxlength="maxlength"
        :readonly="readonly"
        :disabled="disabled"
        :show-password="showPassword"
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @input="$emit('change', $event)"
        @keydown.native="keydownPress"
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

  .s-input {
    border: 1px solid $default-background-color !important;
    padding-left: 25px !important;
  }

  .el-input__inner {
    font-size: 1em !important;
  }

  .s-input .s-placeholder {
    color: $default-white !important;
  }

  .s-placeholder + .el-input {
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

  .s-input {
    background-color: $secondary-background-color !important;
  }
}

.input-style-pink {
  textarea,
  input {
    color: $plain-white !important;
  }

  .s-input {
    background-color: $pink-purple-color !important;
  }
}

.input-size-big {
  .s-input {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.input-size-medium {
  .s-input {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
