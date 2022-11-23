<template>
  <div :class="popupBackgroundClasses" :style="popupBackgroundStyles" @click="backgroundClick">
    <Corners size="big" :topLeftCorner="showBorder" :bottomRightCorner="showBorder" :style="popupContainerStyle">
      <div :class="popupContainerClasses" :style="popupContainerStyles">
        <div v-if="showHeader" class="header">
          <SearchInput v-if="showSearch" v-model="filterValue" :placeholder="placeholder" width="235px" />

          <template v-else>
            <div class="button-close"></div>
            <div class="header-with-icon">
              <Icon v-if="isIcon" className="attention-icon" icon="info-triangle" />

              <div v-if="headerText" :class="headerClasses">{{ $t(headerText) }}</div>
            </div>
          </template>

          <s-button type="link" class="button-close" @click="close">
            <SIcon name="basic-close-24" />
          </s-button>
        </div>

        <Scroll>
          <div class="content">
            <slot></slot>
          </div>
        </Scroll>
      </div>
    </Corners>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import Scroll from '@/components/Scroll.vue';
import SearchInput from '@/components/SearchInput.vue';
import Corners from '@/components/Corners.vue';

type HorizontalPlacement = 'left' | 'center' | 'right';
type VerticalPlacement = 'top' | 'center' | 'bottom';
type Size = 'mini' | 'small' | 'medium' | 'big';
type HeaderType = 'default' | 'success' | 'failed' | 'pending';

@Component({
  components: {
    Scroll,
    SearchInput,
    Corners,
  },
})
export default class Popup extends Vue {
  filterValue = '';

  @Prop({ default: () => () => null }) handlerClose!: VoidFunction;
  @Prop({ default: () => () => null }) handlerFilter!: (value: string) => void;
  @Prop(Number) top!: number;
  @Prop(Number) left!: number;
  @Prop({ type: Number, required: false }) height?: number;
  @Prop({ type: Number, required: false }) maxHeight?: number;
  @Prop({ default: '' }) headerText!: string;
  @Prop({ default: '' }) placeholder!: string;
  @Prop({ default: false }) isIcon!: boolean;
  @Prop({ default: true }) showHeader!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: true }) showAnimation!: boolean;
  @Prop({ default: true }) showBackground!: boolean;
  @Prop({ default: true }) closeBuBackground!: boolean;
  @Prop({ default: false }) showSearch!: boolean;
  @Prop({ default: false }) showBorder!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: Size;
  @Prop({ default: 'center' }) horizontalPlacement!: HorizontalPlacement;
  @Prop({ default: 'center' }) verticalPlacement!: VerticalPlacement;
  @Prop({ default: 'default' }) headerType!: HeaderType;

  get popupBackgroundClasses() {
    const classes = [
      'popup-background',
      this.showBackground ? 'popup-background-show' : 'popup-background-hide',
      {
        'popup-background-blur': this.showBlur && this.showBackground,
        'popup-background-animation': this.showAnimation,
      },
    ];

    if (this.showBackground)
      classes.push(
        `popup-background-horizontal-placement-${this.horizontalPlacement}`,
        `popup-background-vertical-placement-${this.verticalPlacement}`
      );

    return classes;
  }

  get popupContainerClasses() {
    const classes = [
      'popup-container',
      {
        border: this.showBorder,
      },
    ];

    if (this.sizeWidth) classes.push(`width-${this.sizeWidth}`);

    return classes;
  }

  get popupContainerStyles() {
    const styles: Record<string, string> = {};

    if (this.height) styles.height = `${this.height}px`;

    if (this.maxHeight) styles.maxHeight = `${this.maxHeight}px`;

    return styles;
  }

  get headerClasses() {
    const classes = [
      'header-text',
      {
        'header-text-success': this.headerType === 'success',
        'header-text-pending': this.headerType === 'pending',
        'header-text-failed': this.headerType === 'failed',
      },
    ];

    return classes;
  }

  get topLeftStyles() {
    const styles: Record<string, string> = {};

    if (this.top) styles.top = `${this.top}px`;

    if (this.left) styles.left = `${this.left}px`;

    return styles;
  }

  get popupBackgroundStyles() {
    return !this.showBackground ? this.topLeftStyles : {};
  }

  get popupContainerStyle() {
    return this.showBackground ? this.topLeftStyles : {};
  }

  @Watch('filterValue')
  filter(value: string) {
    this.handlerFilter(value);
  }

  backgroundClick(event: Event) {
    if (this.closeBuBackground && (event.target as HTMLDivElement)?.classList.contains('popup-background'))
      this.close();
  }

  close() {
    this.handlerFilter('');
    this.handlerClose();
  }
}
</script>

<style lang="scss" scoped>
.popup-background {
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  margin: 0 auto;
  z-index: 199;
  width: fit-content;
  height: fit-content;

  .popup-container {
    display: flex;
    flex-direction: column;
    position: relative;
    top: 0;
    min-height: 90px;
    min-width: 230px;
    max-height: 410px;
    max-width: 480px;
    background-color: #111111;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
    padding: 15px 0;
  }

  .header-with-icon {
    display: flex;
    flex-flow: column;
    gap: 12px;
  }

  .attention-icon {
    height: 38px;
  }

  .width-big {
    min-width: 370px;
    max-width: 450px;
  }

  .width-medium {
    width: 300px;
  }

  .width-small {
    width: 285px;
  }

  .width-mini {
    width: 230px;
  }

  .border {
    border: 1px solid $default-background-color;
  }

  .content {
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    width: 100%;
    padding-left: $default-padding;
    padding-right: 22px;
    margin-bottom: 10px;

    .header-text {
      font-weight: 700;
      font-size: 18px;
      color: $plain-white;
    }

    .header-text-success {
      color: $success-color;
    }

    .header-text-pending {
      color: $pending-color;
    }

    .header-text-failed {
      color: $reject-color;
    }
  }

  .s-icon-basic-close-24 {
    color: $grayish-white;

    &:hover {
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .button-close {
    padding: 0;
    width: 20px;
    height: 20px;
    margin: auto 0;
  }
}

.popup-background-show {
  height: 100%;
  width: $extension-width;
  padding: $default-padding;
}

.popup-background-hide {
  width: fit-content;
  height: fit-content;
}

.popup-background-blur {
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
}

.popup-background-animation {
  @include opacity;
}

.popup-background-horizontal-placement-left {
  justify-content: flex-start;
}

.popup-background-horizontal-placement-center {
  justify-content: center;
}

.popup-background-horizontal-placement-right {
  justify-content: flex-end;
}

.popup-background-vertical-placement-top {
  align-items: flex-start;
}

.popup-background-vertical-placement-center {
  align-items: center;
}

.popup-background-vertical-placement-bottom {
  align-items: flex-end;
}
</style>
