<template>
  <div
    ref="sheet"
    :class="backgroundClasses"
    :role="contained ? undefined : 'dialog'"
    :aria-modal="contained ? undefined : true"
    :aria-label="contained ? undefined : tHeader || t('common.select')"
    tabindex="-1"
    @keydown="sheetKeydown"
  >
    <div :class="aboveFormClasses">
      <slot v-if="$slots.header" name="header"></slot>

      <div v-else class="header-content">
        <div class="activity align-left">
          <button
            type="button"
            :aria-label="t('ux.back')"
            v-if="props.showBackIcon"
            class="icon icon-back"
            data-testid="backBtn"
            @click="emit('handlerBack')"
          >
            <Icon icon="chevron-left" aria-hidden="true" />
          </button>

          <div v-else class="icon">
            <img :src="sunBadge" class="logo" alt="" />
          </div>
        </div>

        <div class="header" data-testid="header">{{ tHeader }}</div>

        <div class="activity align-right">
          <button
            type="button"
            :aria-label="t('common.close')"
            v-if="props.showCloseIcon"
            class="icon"
            @click="emit('closeHandler')"
          >
            <Icon icon="close" aria-hidden="true" />
          </button>

          <button
            type="button"
            :aria-label="t('common.save')"
            v-show="props.showAcceptIcon"
            class="icon"
            @click="emit('saveChanges')"
          >
            <Icon icon="check" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useModalFocus } from './useModalFocus';
import type { ComponentText } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';
import sunBadge from '@/assets/brand/winged-sun-badge-lines.svg';

type Props = {
  header?: ComponentText;
  blur?: boolean;
  showAcceptIcon?: boolean;
  showBackIcon?: boolean;
  fullScreen?: boolean;
  contained?: boolean;
  showCloseIcon?: boolean;
  showAnimation?: boolean;
};

const { t } = useI18n();
const emit = defineEmits(['handlerBack', 'closeHandler', 'saveChanges']);

const props = withDefaults(defineProps<Props>(), {
  header: '',
  blur: false,
  showAcceptIcon: false,
  fullScreen: false,
  contained: false,
  isDisabledClose: false,
  showBackIcon: false,
  showCloseIcon: true,
  showAnimation: true,
});

const sheet = ref<HTMLElement | null>(null);
const sheetKeydown = useModalFocus(
  sheet,
  () => !props.contained,
  () => {
    if (props.contained || !props.showCloseIcon) return false;
    emit('closeHandler');
    return true;
  }
);

const tHeader = computed(() => {
  if (typeof props.header === 'string') return t(props.header);

  return t(props.header.text, props.header.localeProps);
});

const backgroundClasses = computed(() => {
  return [
    'form-background',
    {
      'background-blur': props.blur,
      'form-contained': props.contained,
      'form-animation': props.showAnimation,
    },
  ];
});

const aboveFormClasses = computed(() => {
  return [
    'form',
    {
      fullscreen: props.fullScreen,
    },
  ];
});
</script>

<style lang="scss" scoped>
.fw-web {
  .form-background {
    width: 100%;
  }
}

.form-background {
  height: 100%;
  width: $extension-width;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  margin: 0 auto;
  z-index: 299;

  .form {
    position: relative;
    top: 80px;
    width: $extension-width;
    min-height: $extension-height - 80px;
    height: calc(100% - 80px);
    // Sheets are opaque raised paint, and Calm screens open in them (design-system 2.1, 3.2).
    background-color: $fw-panel-surface;
    clip-path: $big-clip-path-left-top;

    @keyframes transform {
      0% {
        transform: translateY(10%);
      }
      100% {
        transform: translateY(0);
      }
    }

    .content {
      height: calc(100% - 80px);
      padding: $default-padding $default-padding 0;
    }

    .s-icon-basic-close-24 {
      font-weight: 400;
      opacity: 0.8;
      color: $grayish-white;

      &:hover {
        cursor: pointer;
        opacity: 1;
      }
    }

    .s-icon-basic-check-mark-24 {
      font-weight: 400;
      color: $pink-lavender-color;
      opacity: 0.8;

      &:hover {
        cursor: pointer;
        opacity: 1;
      }
    }

    .header-content {
      height: 64px;
      font-size: 1.5rem;
      display: flex;
      justify-content: space-between;
      padding: $default-padding;
      border-bottom: $default-border;
    }

    .icon {
      margin-left: 5px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      user-select: none;

      &:last-child {
        margin-left: 15px;
      }
    }

    .icon-back {
      opacity: 0.8;
      width: 18px;

      &:hover {
        cursor: pointer;
        opacity: 1;
      }
    }

    .header {
      font-size: 1.125em;
      font-weight: 700;
      margin: auto 0;
      text-transform: capitalize;
    }

    .activity {
      display: flex;
      width: 80px;
    }

    .align-left {
      justify-content: left;
    }

    .align-right {
      justify-content: right;
    }

    .logo {
      width: 45px;
      height: 45px;
    }
  }

  .fullscreen {
    height: 100%;
    top: 0;
    clip-path: none;
  }
}

.background-blur {
  background: rgba(51, 51, 51, 0.5);
  backdrop-filter: blur(5px);
  @include fw-scrim-tiers(#333);
}

.form-animation {
  @include opacity;
}
</style>

<style lang="scss" scoped>
.form-background {
  position: fixed;
  max-width: 100vw;
  height: 100dvh;
}
.form-background .form {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.form-background .form .header-content {
  flex-shrink: 0;
  height: auto;
  min-height: 80px;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
}
.form-background .form .header {
  font-size: 1.125rem;
  overflow-wrap: anywhere;
}
.form-background .form .activity {
  width: 48px;
  flex-shrink: 0;
}
.form-background .form .activity > .icon {
  margin: 0;
}
.form-background .form .content {
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: auto;
  padding-bottom: 16px;
  box-sizing: border-box;
}
.form-background .form button.icon {
  width: 44px;
  min-height: 44px;
  padding: 10px;
  margin: 0;
  background: transparent;
  border: 0;
  color: inherit;
}
.form-background .form button.icon:focus-visible {
  outline: 2px solid palette($pink-color, var(--fw-focus));
}
@include v1-palette {
  .form-background .form {
    border-radius: 24px 24px 0 0;
    clip-path: none;
    border-top: 1px solid var(--fw-stroke-strong);
  }
  .form-background .fullscreen {
    border-radius: 0;
    border: 0;
  }
}
</style>

<style lang="scss">
.fw-web .form-background {
  width: 100%;
  max-width: 1120px;
}
.form-background.form-contained {
  position: relative;
  inset: auto;
  width: 100%;
  max-width: 100%;
  height: 100%;
  z-index: auto;
}
.form-background.form-contained .form {
  top: 0;
  min-height: 0;
  height: 100%;
}
</style>

<style lang="scss" scoped>
// At narrow widths the decorative logo must not force a large accessibility
// heading into single-syllable lines and consume the entire review viewport.
@media (max-width: 360px) {
  .form-background .form .align-left:has(.logo) {
    display: none;
  }
}
</style>

<style lang="scss" scoped>
// A short landscape/zoomed viewport must be able to scroll past the header.
// Keeping an arbitrarily tall translated title pinned can hide the review.
@media (max-height: 400px) {
  .form-background .form {
    overflow-y: auto;
  }
  .form-background .form .content {
    flex: 0 0 auto;
    overflow: visible;
  }
}
</style>
