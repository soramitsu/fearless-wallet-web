<template>
  <Popup
    sizeWidth="big"
    class="popup-with-choice"
    :headerText="header"
    :placeholder="placeholder"
    :showSearch="showSearch"
    :showBorder="showBorder"
    :staticHeight="staticHeight"
    :handlerFilter="handlerFilter"
    :handlerClose="handlerClose"
    :horizontalPlacement="horizontalPlacement"
    :verticalPlacement="verticalPlacement"
    :top="top"
    :left="left"
  >
    <div
      v-for="({ label, value, path }, index) in options"
      :key="label"
      :class="rowClasses(value)"
      @click="toggle(value)"
    >
      <div class="description">
        <img v-if="showIcon" :src="getImg(path, index)" class="img" />

        {{ label }}
      </div>
      <s-icon name="basic-check-mark-24" v-show="VModel === value" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Popup from './Popup.vue';

type SpaceSize = 'small' | 'medium' | 'big';

@Component({
  components: { Popup },
})
export default class SelectPopup extends Vue {
  icons: string[] = [];

  @VModel({ type: String }) VModel!: string;
  @Prop(Array) options!: Record<string, string>[];
  @Prop(String) header!: string;
  @Prop(Number) top!: number;
  @Prop(Number) left!: number;
  @Prop({ default: 'center' }) horizontalPlacement!: string;
  @Prop({ default: 'center' }) verticalPlacement!: string;
  @Prop({ default: 'medium' }) space!: SpaceSize;
  @Prop({ default: '' }) placeholder!: string;
  @Prop({ default: false }) showIcon!: boolean;
  @Prop({ default: false }) showSearch!: boolean;
  @Prop({ default: false }) showBorder!: boolean;
  @Prop({ default: false }) staticHeight!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: boolean;
  @Prop(Function) toggleValue!: (value: string) => void;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop({ default: () => () => null }) handlerFilter!: (value: string) => void;

  getImg(path: string) {
    return require(`@/assets/${path}`);
  }

  rowClasses(value: string) {
    return [
      'row',
      {
        'row-active': this.VModel === value,
      },
      `margin-${this.space}`,
    ];
  }

  toggle(value: string) {
    this.toggleValue(value);
  }
}
</script>

<style lang="scss" scoped>
.popup-with-choice {
  .row {
    color: rgba(255, 255, 255, 0.75);
    text-align: left;
    width: 100%;
    height: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    padding-left: 16px;
    padding-right: 16px;

    &:hover {
      cursor: pointer;
      background-color: rgba(255, 255, 255, 0.05);
    }

    &:first-child {
      margin-top: 0;
    }
  }

  .margin-small {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .margin-medium {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .margin-big {
    padding-top: 24px;
    padding-bottom: 24px;
  }

  .description {
    display: flex;
    align-items: center;

    .img {
      width: 24px;
      height: 24px;
      margin-right: 10px;
      opacity: 0.65;
      user-select: none;
    }
  }

  .row-active {
    color: #ffffff;
    font-weight: 700;

    .img {
      opacity: 1;
    }
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }
}
</style>
