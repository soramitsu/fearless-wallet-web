<template>
  <div :class="containerButtonClasses" :style="containerButtonStyle">
    <button
      type="button"
      :disabled="!focusableWhenDisabled && (disabled || loading)"
      :aria-disabled="disabled || loading || undefined"
      :aria-describedby="showDisabledReason ? reasonId : undefined"
      :aria-busy="loading"
      :class="['el-button', buttonClasses, { 'is-disabled': disabled, 'is-loading': loading }]"
      :style="buttonStyle"
      @click="onClick"
    >
      <span v-if="loading" class="button-progress" aria-hidden="true"></span>
      <Icon
        aria-hidden="true"
        v-else-if="shouldBeWithIcon"
        :icon="prepIconName"
        :className="prepIconClass"
        :iconColor="iconColor"
      />

      <span>{{ tText }}</span>
    </button>
    <p v-if="showDisabledReason" :id="reasonId" class="button-disabled-reason">{{ t(disabledReason) }}</p>
  </div>
</template>

<script lang="ts" setup>
import { computed, useId } from 'vue';
import type { ComponentText } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';

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
  /** Opt in only where the unavailable action has a visible state or explanation. */
  focusableWhenDisabled?: boolean;
  disabledReason?: string;
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
  focusableWhenDisabled: false,
  disabledReason: '',
  loading: false,
  hover: true,
  border: true,
});

const emit = defineEmits(['click']);
const reasonId = useId();
const showDisabledReason = computed(() => !!props.disabledReason && (props.disabled || props.loading));
const onClick = () => {
  if (props.disabled || props.loading) return;
  emit('click');
};
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
  // for "mini" sizes also small
  const sizeName = props.size === 'big' ? 'big' : props.size === 'medium' ? 'medium' : 'small';

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
  const classes = ['button', 'btn-content', `button-font-size-${props.fontSize}`];

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

  return [...classes, 'primary'];
});
</script>

<style lang="scss" scoped>
.button-disabled-reason {
  margin: 8px 0 0;
  color: palette($grayish-white, var(--fw-text-2));
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
  overflow-wrap: anywhere;
}

.primary {
  // White labels need 4.5:1: the legacy look darkens the brand pink by 4% (mix(black, #ee0077, 4%)), Neon Glass
  // fills with accent.fill (5.04:1 at its lightest stop).
  background: palette(rgb(228.48, 0, 114.24), var(--fw-fill));
  color: palette(white, var(--fw-on-accent));
  border-color: palette(rgb(228.48, 0, 114.24), var(--fw-fill-top));
}
.button:focus-visible {
  outline: 2px solid white;
  outline-offset: -4px;
}
.btn-content {
  display: flex;
  justify-content: center;
  align-items: center;

  > span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.import-button {
  height: 109px;
}

.import-button .el-button {
  padding: 12px 38px;
}

.button-size-big {
  .button {
    min-height: 48px;
    height: auto;
    padding: 12px 20px;
    white-space: normal;
    line-height: 1.4;
  }
  .el-button {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
  }
}

.button-size-medium {
  .button {
    min-height: 44px;
    height: auto;
    white-space: normal;
  }
  .el-button {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
    padding: 10px 10px;
  }
}

.button-size-small {
  .el-button {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }

  .button {
    width: 100%;
    padding: 10px 10px;
    min-height: 32px;
    height: auto;
    white-space: normal;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
}

.button-warning {
  .el-button {
    background-color: $simple-orange-color;
    border: none;
    // On amber only the base colour reads (12.27:1).
    color: palette($plain-white, var(--fw-bg-base));
  }
}

.button-font-size-big {
  font-size: 1.125em;
}

.button-font-size-medium {
  font-size: 1em;
}

.button-font-size-small {
  font-size: 0.75em;
}

.el-button + .el-button {
  margin-left: 0;
}

.el-button.s-primary:disabled {
  color: $gray-color;
}

.is-disabled {
  opacity: palette(0.7, 1);
  background-color: palette(#f8087b, var(--fw-raised-2)) !important;
  border-color: palette(#f8087b, var(--fw-raised-2)) !important;

  // A disabled button is flat raised-2 with a tertiary label (5.75:1), never the fill at reduced opacity.
  @include v1-palette {
    background-image: none !important;
    color: var(--fw-text-3) !important;
  }
}

// Element Plus adds a pale mask above loading buttons, including their labels.
// Our explicit busy state supplies its own indicator and preserves text contrast.
.el-button.is-loading::before {
  display: none;
}

.button-progress {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  margin-right: 8px;
  animation: spin 1s linear infinite;
}

.button--content-wrap > .el-button span {
  font-size: 0.875rem;
  font-weight: 400;
  flex-flow: row nowrap;
  white-space: break-spaces;
}

.button__icon {
  font-size: 0.875rem;
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

.secondary-border {
  border: 1px solid palette($default-background-color, var(--fw-stroke-control)) !important;
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

@include v1-palette {
  .button-size-big .button,
  .button-size-medium .button,
  .button-size-small .button {
    border-radius: 14px;
    clip-path: none;
    transition:
      transform var(--fw-dur-fast) var(--fw-ease),
      background-color var(--fw-dur-fast) var(--fw-ease);
    &:focus-visible {
      outline: 2px solid var(--fw-focus);
      outline-offset: -4px;
    }
    &:active:not(:disabled):not([aria-disabled='true']) {
      transform: scale(0.98);
    }
  }
  .primary {
    min-height: 48px;
    border-color: var(--fw-accent-edge);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18);
    &:active:not(:disabled):not([aria-disabled='true']) {
      background: var(--fw-fill-bottom);
    }
  }
  .button-size-small .button {
    min-height: 44px;
    height: auto;
  }
  .secondary-hover:hover {
    border-color: var(--fw-stroke-control) !important;
  }
  .secondary:active:not(:disabled):not([aria-disabled='true']),
  .thirdly:active:not(:disabled):not([aria-disabled='true']) {
    background: var(--fw-pressed) !important;
  }
  .link {
    color: var(--fw-link) !important;
    min-height: 44px;
  }
  .is-disabled,
  .is-loading {
    box-shadow: none;
  }
  // State must win over the later secondary/google variant and hover rules.
  .button.is-disabled {
    background: var(--fw-raised-2) !important;
    border-color: var(--fw-raised-2) !important;
    color: var(--fw-text-3) !important;
  }
  .button.primary.is-loading {
    background: var(--fw-fill) !important;
    border-color: var(--fw-fill-top) !important;
    color: var(--fw-on-accent) !important;
    box-shadow: 0 0 16px rgb(255 0 154 / 0.4);

    html[data-fw-effects='reduced'] &,
    .fw-calm & {
      box-shadow: none;
    }
  }
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
  font-size: 0.875em;
  font-weight: 400;
  gap: 5px;
}

.import-button .button {
  height: 100%;
}
</style>
