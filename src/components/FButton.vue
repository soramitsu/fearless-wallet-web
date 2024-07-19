<template>
  <div :class="containerButtonClasses" :style="containerButtonStyle">
    <SButton
      :type="type"
      :border-radius="borderRadius"
      :size="size"
      :disabled="disabled"
      :class="buttonClasses"
      :loading="loading"
      :style="buttonStyle"
      @click="$emit('click')"
    >
      <Icon v-if="shouldBeWithIcon" :icon="prepIconName" :className="prepIconClass" :iconColor="iconColor" />

      <span>{{ tText }}</span>
    </SButton>
  </div>
</template>

<script lang="ts" setup>
import { computed, withDefaults } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import type { ComponentText } from '@/interfaces';

type Size = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary' | 'thirdly' | 'link' | 'google' | 'warning';
type TypeText = 'none' | 'uppercase';

type FButtonProps = {
  text?: ComponentText;
  width?: string;
  iconName?: string;
  iconType?: string;
  iconColor?: string;
  type?: Type;
  size?: Size;
  fontSize?: FontSize;
  borderRadius?: Size;
  typeText?: TypeText;
  disabled?: boolean;
  loading?: boolean;
  hover?: boolean;
  border?: boolean;
};

const props = withDefaults(defineProps<FButtonProps>(), {
  text: '',
  width: '',
  iconName: '',
  iconType: '',
  iconColor: 'default',
  type: 'primary',
  size: 'medium',
  fontSize: 'medium',
  borderRadius: 'medium',
  typeText: 'none',
  disabled: false,
  loading: false,
  hover: true,
  border: true,
});

const { t, tc } = useI18n();

const tText = computed(() => {
  if (typeof props.text === 'string') return t(props.text);

  const { text, localeProps } = props.text;

  if (localeProps) {
    const { tc: _tc } = localeProps;

    if (_tc) return tc(text, _tc, localeProps);
  }

  return t(text, localeProps);
});

const buttonStyle = computed(() => {
  const styles: Record<string, string> = {
    'text-transform': props.typeText,
  };

  return styles;
});

const shouldBeWithIcon = computed(() => props.iconName || props.type === 'google');

const prepIconClass = computed(() => {
  const result = ['icon'];
  if (props.text === '') result.push('icon--without-text');

  if (props.iconType === 'loading') result.push('icon--loading');
  if (props.type === 'google') result.push('icon--google');

  return result;
});

const prepIconName = computed(() => {
  if (props.type === 'google') return 'google';

  return props.iconName;
});

const containerButtonClasses = computed(() => {
  // for "small" and "mini" sizes also medium
  const sizeName = props.size === 'big' ? 'big' : 'medium';

  return [
    `button-size-${sizeName}`,
    {
      'button-warning': props.type === 'warning',
    },
  ];
});

const containerButtonStyle = computed(() => {
  const styles: Record<string, string> = {};

  if (props.width) styles.width = `${props.width}`;

  return styles;
});

const buttonClasses = computed(() => {
  const classes = ['button', `button-font-size-${props.fontSize}`];

  if (props.iconType === 'big') classes.push('button__icon');

  if (props.type === 'secondary') {
    return [
      ...classes,
      'secondary',
      props.border ? 'secondary-border' : 'secondary-border-none',
      {
        'secondary-hover': props.hover,
        'secondary-border-hover': props.border && props.hover,
      },
    ];
  }

  if (props.type === 'thirdly') {
    return [
      ...classes,
      'thirdly',
      props.border ? 'secondary-border' : 'secondary-border-none',
      {
        'thirdly-hover': props.hover,
        'secondary-border-hover': props.border && props.hover,
      },
    ];
  }

  if (props.type === 'link') {
    return [
      `button-font-size-${props.fontSize}`,
      'link',
      {
        'link-hover': props.hover,
      },
    ];
  }

  if (props.type === 'google') {
    return [
      ...classes,
      `button-font-size-${props.fontSize}`,
      'google',
      props.border ? 'google-border' : 'google-border-none',
      {
        'google-hover': props.hover,
        'google-border-hover': props.border && props.hover,
      },
    ];
  }

  return classes;
});
</script>

<style lang="scss" scoped>
.button-size-big {
  .el-button {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
  }
}

.import-button {
  height: 109px;
}

.import-button .el-button {
  padding: 12px 38px;
}

.button-size-medium {
  .el-button {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
    padding: 10px 10px;
  }
}

.button-warning {
  .el-button {
    background-color: $simple-orange-color;
    border: none;
    color: $plain-white;
  }
}

.button-font-size-big {
  font-size: 18px;
}

.button-font-size-medium {
  font-size: 16px;
}

.button-font-size-small {
  font-size: 13px;
}

.el-button + .el-button {
  margin-left: 0;
}

.el-button.s-primary:disabled {
  color: $gray-color;
}

.is-disabled {
  opacity: 0.7;
  background-color: #f8087b !important;
  border-color: #f8087b !important;
}

.button--content-wrap > .el-button span {
  font-size: 14px;
  font-weight: 400;
  flex-flow: row nowrap;
  white-space: break-spaces;
}

.button__icon {
  font-size: 14px;
  white-space: break-spaces;
}

.import-button .el-button span .icon {
  margin-right: 0px;
  width: 32px;
  height: 32px;
}

.icon {
  margin-right: 8px;
  min-width: 20px;
  width: 20px;
  height: 20px;
}

.icon--without-text {
  margin: 0;
}

.icon--pink {
  color: $pink-color;
}

.icon--google {
  width: 37px;
  height: 37px;
}

.secondary {
  background-color: $secondary-background-color !important;
  color: #fff !important;
}

.secondary-hover:hover {
  background-color: $default-background-color !important;
}
.thirdly {
  background-color: $secondary-btn-color !important;
  color: #fff !important;
}

.thirdly-hover:hover {
  background-color: $secondary-background-color !important;
  color: $default-white !important;
}

.thirdly {
  background-color: $secondary-btn-color !important;
  color: #fff !important;
}

.thirdly-hover:hover {
  background-color: $secondary-background-color !important;
  color: $default-white !important;
}

.secondary-border {
  border: 1px solid $default-background-color !important;
}

.secondary-border-none {
  border: $secondary-background-color !important;
}

.secondary-border-hover:hover {
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.link {
  color: $default-white !important;
}

.link-hover:hover {
  color: $default-white !important;
}

.google {
  color: rgba(45, 41, 38, 1) !important;
  background-color: #c4c4c4 !important;
}

.google:disabled {
  color: rgba(45, 41, 38, 1) !important;
  background-color: #c4c4c4 !important;
}

.google-hover:not(:disabled):hover {
  background-color: rgba(255, 255, 255, 0.5) !important;
  border-color: transparent;
}

.google-border {
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
}

.google-border-hover:hover {
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.icon--loading {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>

<style lang="scss">
.import-button .el-button span {
  line-height: 18px;
  flex-flow: column;
  max-width: 140px;
  font-size: 14px;
  font-weight: 400;
  gap: 5px;
}

.import-button .button {
  height: 100%;
}
</style>
