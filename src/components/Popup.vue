<template>
  <div :class="popupBackgroundClasses" :style="popupBackgroundStyles" @click="backgroundClick">
    <Corners size="big" :topLeftCorner="showBorder" :bottomRightCorner="showBorder" :style="popupContainerStyle">
      <div :class="popupContainerClasses">
        <div v-if="showHeader" class="header">
          <SearchInput v-if="showSearch" v-model="filterValue" :placeholder="placeholder" />

          <template v-else>
            <div class="button"></div>
            <div class="header-text">{{ headerText }}</div>
          </template>

          <s-button type="link" class="button" @click="close">
            <s-icon name="basic-close-24" />
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
import Scroll from './Scroll.vue';
import SearchInput from './SearchInput.vue';
import Corners from './Corners.vue';

type HorizontalPlacement = 'left' | 'center' | 'right';
type VerticalPlacement = 'top' | 'center' | 'bottom';
type Size = 'mini' | 'small' | 'medium' | 'big';

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
  @Prop({ default: '' }) headerText!: string;
  @Prop({ default: '' }) placeholder!: string;
  @Prop({ default: true }) showHeader!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: true }) showAnimation!: boolean;
  @Prop({ default: true }) showBackground!: boolean;
  @Prop({ default: false }) showSearch!: boolean;
  @Prop({ default: false }) showBorder!: boolean;
  @Prop({ default: false }) staticHeight!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: Size;
  @Prop({ default: 'center' }) horizontalPlacement!: HorizontalPlacement;
  @Prop({ default: 'center' }) verticalPlacement!: VerticalPlacement;

  get popupBackgroundClasses() {
    const classes = [
      'popup-background',
      {
        'popup-background-blur': this.showBlur && this.showBackground,
        'popup-background-animation': this.showAnimation,
        'popup-background-container': this.showBackground,
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
        'static-height': this.staticHeight,
        border: this.showBorder,
      },
    ];

    if (this.sizeWidth) classes.push(`width-${this.sizeWidth}`);

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
    if ((event.target as HTMLDivElement)?.classList.contains('popup-background')) this.close();
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
  z-index: 199;

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

  .static-height {
    height: 410px;
  }

  .width-big {
    width: 370px;
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
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .content {
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-left: $default-padding;
    padding-right: 22px;
    margin-bottom: 10px;

    .header-text {
      font-weight: 700;
      font-size: 18px;
      color: $default-white;
    }
  }

  .s-icon-basic-close-24 {
    color: rgba(255, 255, 255, 0.65);

    &:hover {
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .button {
    padding: 0;
    width: 20px;
    height: 20px;
  }
}

.popup-background-container {
  height: $extension-height;
  width: $extension-width;
  padding: $default-padding;
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
