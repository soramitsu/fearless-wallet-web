<template>
  <Popup
    :headerText="header"
    :showSearch="showSearch"
    :staticHeight="staticHeight"
    :handlerFilter="handlerFilter"
    :handlerClose="handlerClose"
    :horizontalPlacement="horizontalPlacement"
    :verticalPlacement="verticalPlacement"
    :top="top"
    :left="left"
    class="popup-with-choice"
  >
    <div v-for="{ label, value, path } in options" :key="label" :class="rowClasses(value)" @click="toggleValue(value)">
      <div class="description">
        <img v-if="showIcon" :src="getImg(path)" class="img" />

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
export default class extends Vue {
  @VModel({ type: String }) VModel!: string;
  @Prop(Array) options!: Record<string, string>[];
  @Prop(String) header!: string;
  @Prop(Number) top!: number;
  @Prop(Number) left!: number;
  @Prop({ default: 'center' }) horizontalPlacement!: string;
  @Prop({ default: 'center' }) verticalPlacement!: string;
  @Prop({ default: 'medium' }) space!: SpaceSize;
  @Prop({ default: false }) showIcon!: boolean;
  @Prop({ default: false }) showSearch!: boolean;
  @Prop({ default: false }) staticHeight!: boolean;

  @Prop(Function) toggleValue!: VoidFunction;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerFilter!: (value: string) => void;

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
}
</script>

<style lang="scss" scoped>
.popup-with-choice {
  padding: 0 !important;

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
      margin-right: 10px;
      opacity: 0.65;
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
    color: var(--pink-lavender-color);
  }
}
</style>
