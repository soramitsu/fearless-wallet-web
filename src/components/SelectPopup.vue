<template>
  <Popup
    sizeWidth="big"
    class="select-popup"
    :headerText="header"
    :placeholder="placeholder"
    :showSearch="showSearch"
    :showBorder="showBorder"
    :height="height"
    :maxHeight="maxHeight"
    :handlerFilter="handlerFilter"
    :handlerClose="handlerClose"
    :horizontalPlacement="horizontalPlacement"
    :verticalPlacement="verticalPlacement"
    :showBlur="showBlur"
    :showAnimation="showAnimation"
    :showBackground="showBackground"
    :top="top"
    :left="left"
  >
    <div v-for="{ label, value, path } in options" :key="label" :class="rowClasses(value)" @click="toggle(value)">
      <div class="description">
        <img v-if="showIcon" :src="getImg(path)" class="img" />

        {{ label }}
      </div>

      <s-icon name="basic-check-mark-24" v-show="VModel === value" />
    </div>

    <div v-if="showWarning" class="warning">Nothing found</div>
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
  formattedOptions: Record<string, string>[] = [];

  @VModel({ type: String }) VModel!: string;
  @Prop(Array) options!: Record<string, string>[];
  @Prop(String) header!: string;
  @Prop(Number) top!: number;
  @Prop(Number) left!: number;
  @Prop({ default: 'center' }) horizontalPlacement!: string;
  @Prop({ default: 'center' }) verticalPlacement!: string;
  @Prop({ default: 'big' }) space!: SpaceSize;
  @Prop({ default: '' }) placeholder!: string;
  @Prop({ type: Number, required: false }) height!: number;
  @Prop({ type: Number, required: false }) maxHeight!: number;
  @Prop({ default: true }) showIcon!: boolean;
  @Prop({ default: true }) showSearch!: boolean;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: true }) showAnimation!: boolean;
  @Prop({ default: true }) showBackground!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: boolean;
  @Prop(Function) toggleValue!: (value: string) => void;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop({ default: () => () => null }) handlerFilter!: (value: string) => void;

  get showWarning() {
    return this.options.length === 0;
  }

  beforeMount() {
    const index = this.options.findIndex(({ value }) => value === this.VModel);

    if (index === -1) return;

    const selectedElement = this.options[index];
    const indexInsertion = this.options[0]?.isAll && index !== 0 ? 1 : 0;

    this.options.splice(index, 1);
    this.options.splice(indexInsertion, 0, selectedElement);

    this.options.forEach(({ path }) => this.getImg(path));
  }

  getImg(path: string) {
    return require(`@/assets/${path}`);
  }

  rowClasses(value: string) {
    return [
      'row',
      {
        'row-active': this.VModel === value,
      },
      `padding-${this.space}`,
    ];
  }

  toggle(value: string) {
    this.toggleValue(value);
  }
}
</script>

<style lang="scss" scoped>
.select-popup {
  z-index: 299;

  .row {
    color: $default-white;
    text-align: left;
    width: 100%;
    height: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    padding: 0 $default-padding;

    &:hover {
      cursor: pointer;
      background-color: $secondary-background-color;
    }

    &:first-child {
      margin-top: 0;
    }
  }

  .padding-small {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .padding-medium {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .padding-big {
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

  .warning {
    height: 48px;
    line-height: 48px;
  }
}
</style>
