<template>
  <div :class="popupBackgroundClasses" @click="backgroundClick">
    <Corners
      size="big"
      :left="left"
      :top="top"
      :topLeftCorner="showBorder"
      :bottomRightCorner="showBorder"
      :style="popupContainerStyle"
    >
      <div :class="popupContainerClasses">
        <div v-if="showHeader" class="header">
          <SearchInput v-if="showSearch" v-model="filterValue" placeholder="Search in networks" />

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
type Size = 'medium' | 'bid';

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
  @Prop({ default: true }) showHeader!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: false }) showSearch!: boolean;
  @Prop({ default: false }) showBorder!: boolean;
  @Prop({ default: false }) staticHeight!: boolean;
  @Prop({ default: false }) sizeWidth!: Size;
  @Prop({ default: 'center' }) horizontalPlacement!: HorizontalPlacement;
  @Prop({ default: 'center' }) verticalPlacement!: VerticalPlacement;

  get popupBackgroundClasses() {
    return [
      'popup-background',
      `popup-background-horizontal-placement-${this.horizontalPlacement}`,
      `popup-background-vertical-placement-${this.verticalPlacement}`,
      {
        'popup-background-blur': this.showBlur,
      },
    ];
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

  get popupContainerStyle() {
    const styles: Record<string, string> = {};

    if (this.top) styles.top = `${this.top}px`;

    if (this.left) styles.left = `${this.left}px`;

    return styles;
  }

  @Watch('filterValue')
  filter(value: string) {
    this.handlerFilter(value);
  }

  backgroundClick(event: Event) {
    if ((event.target as any)?.classList.contains('popup-background')) this.close();
  }

  close() {
    this.handlerFilter('');
    this.handlerClose();
  }
}
</script>

<style lang="scss" scoped>
.popup-background {
  height: $extension-height;
  width: $extension-width;
  border-radius: $default-border-radius;
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 199;
  padding: 16px;
  animation: opacity 0.3s;

  @keyframes opacity {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .popup-container {
    display: flex;
    flex-direction: column;
    position: relative;
    top: 0;
    min-height: 90px;
    min-width: 230px;
    max-height: 390px;
    max-width: 480px;
    background-color: #111111;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
    padding: 15px 0;
  }

  .static-height {
    height: 390px;
  }

  .width-big {
    width: 370px;
  }

  .width-medium {
    width: 300px;
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
    padding-left: 16px;
    padding-right: 22px;
    margin-bottom: 10px;

    .header-text {
      font-weight: 700;
      font-size: 18px;
      color: rgba(255, 255, 255, 0.75);
    }
  }

  .s-icon-basic-close-24 {
    color: rgba(255, 255, 255, 0.65);
  }

  .button {
    padding: 0;
    width: 20px;
    height: 20px;
  }
}

.popup-background-blur {
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
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
