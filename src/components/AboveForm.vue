<template>
  <div :class="backgroundClasses">
    <div class="above-form">
      <div class="header-content">
        <div v-if="showBackIcon" class="icon icon-back" @click="handlerBack">
          <img src="@/assets/chevron-left.svg" />
        </div>
        <div v-else class="icon">
          <img src="@/assets/fw-logo.svg" class="logo" />
        </div>
        <div class="header">{{ header }}</div>
        <div class="activity">
          <div v-if="showCloseIcon" class="icon" @click="closeHandler">
            <s-icon name="basic-close-24" />
          </div>
          <div v-show="showAcceptIcon" class="icon" @click="saveChanges">
            <s-icon name="basic-check-mark-24" />
          </div>
        </div>
      </div>
      <div class="content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class AboveForm extends Vue {
  @Prop({ default: '' }) header!: string;
  @Prop({ default: false }) blur!: boolean;
  @Prop({ default: false }) showAcceptIcon!: boolean;
  @Prop({ default: false }) showBackIcon!: boolean;
  @Prop({ default: true }) showCloseIcon!: boolean;
  @Prop({ default: () => () => null }) saveChanges!: VoidFunction;
  @Prop({ default: () => () => null }) handlerBack!: VoidFunction;
  @Prop(Function) closeHandler!: VoidFunction;

  get backgroundClasses() {
    return [
      'above-form-background',
      {
        'above-form-background-blur': this.blur,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.above-form-background {
  @include opacity;

  height: 100%;
  width: $extension-width;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  margin: 0 auto;
  z-index: 299;

  .above-form {
    position: relative;
    top: 80px;
    width: $extension-width;
    min-height: $extension-height;
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
    }

    .icon-back {
      opacity: 0.8;

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
      justify-content: right;
    }

    .icon {
      display: flex;
      flex-direction: column;
      justify-content: center;

      &:last-child {
        margin-left: 15px;
      }
    }

    .logo {
      width: 45px;
    }
  }
}

.above-form-background-blur {
  background: rgba(51, 51, 51, 0.5);
  backdrop-filter: blur(5px);
}
</style>
