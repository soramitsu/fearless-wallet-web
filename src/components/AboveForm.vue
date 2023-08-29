<template>
  <div :class="backgroundClasses">
    <div :class="aboveFormClasses">
      <slot v-if="$slots.header" name="header"></slot>

      <div v-else class="header-content">
        <div class="activity align-left">
          <div v-if="showBackIcon" class="icon icon-back" @click="emit('back')">
            <Icon icon="chevron-left" />
          </div>

          <div v-else class="icon">
            <Icon icon="fw-logo" className="logo" />
          </div>
        </div>

        <div class="header">{{ tHeader }}</div>

        <div class="activity align-right">
          <div v-if="showCloseIcon" class="icon" @click="emit('close')">
            <SIcon name="basic-close-24" />
          </div>

          <div v-show="showAcceptIcon" class="icon" @click="emit('saveChanges')">
            <SIcon name="basic-check-mark-24" />
          </div>
        </div>
      </div>

      <div class="content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, withDefaults } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import type { ComponentText } from '@/interfaces';

const { t } = useI18n();

const emit = defineEmits(['back', 'close', 'saveChanges']);
const { blur, fullScreen, header, showAcceptIcon, showAnimation, showBackIcon, showCloseIcon } = withDefaults(
  defineProps<{
    header?: ComponentText;
    blur?: boolean;
    showAcceptIcon?: boolean;
    showBackIcon?: boolean;
    fullScreen?: boolean;
    showCloseIcon?: boolean;
    showAnimation?: boolean;
  }>(),
  {
    header: '',
    blur: false,
    showAcceptIcon: false,
    fullScreen: false,
    showBackIcon: false,
    showCloseIcon: true,
    showAnimation: true,
  }
);

const tHeader = computed(() => {
  if (typeof header === 'string') return t(header);

  return t(header.text, header.localeProps);
});

const backgroundClasses = computed(() => {
  return [
    'form-background',
    {
      'background-blur': blur,
      'form-animation': showAnimation,
    },
  ];
});

const aboveFormClasses = computed(() => {
  return [
    'form',
    {
      fullscreen: fullScreen,
    },
  ];
});
</script>

<style lang="scss" scoped>
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
    background-color: #111111;
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
      font-size: 24px;
      display: flex;
      justify-content: space-between;
      padding: $default-padding;
      border-bottom: 1px solid $default-background-color;
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
      font-size: 18px;
      font-weight: 700;
      margin: auto 0;
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
}

.form-animation {
  @include opacity;
}
</style>
