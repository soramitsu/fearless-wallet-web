<template>
  <Popup
    sizeWidth="big"
    class="select-popup"
    :headerText="headerText"
    :placeholder="placeholder"
    :showSearch="showSearch"
    :showBorder="showBorder"
    :height="height"
    :maxHeight="maxHeight"
    :horizontalPlacement="horizontalPlacement"
    :verticalPlacement="verticalPlacement"
    :showBlur="showBlur"
    :showAnimation="showAnimation"
    :showBackground="showBackground"
    :top="top"
    :left="left"
    @handlerFilter="$emit('handlerFilter', ...arguments)"
    @handlerClose="$emit('handlerClose')"
  >
    <div
      v-for="{ name, value, icon, iconType, tokenName } in options"
      :key="value"
      :class="rowClasses(value)"
      @click="toggle(value)"
    >
      <div class="description" data-testid="description">
        <template v-if="showIcon">
          <Identicon v-if="isAddressIconType(iconType)" :address="value" class="img" />

          <Icon v-else-if="isGlobusIcon(icon)" :icon="icon" className="img" />

          <ExternalLogo v-else :name="icon" class="img" />
        </template>

        <div class="description-name">
          {{ name }}
          <span class="description-name__token">
            {{ tokenName }}
          </span>
        </div>
      </div>

      <SIcon name="basic-check-mark-24" v-show="getIconVisible(value)" />
    </div>

    <div v-if="showWarning" class="warning" data-testid="warning">Nothing found</div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from './Popup.vue';

type SpaceSize = 'small' | 'medium' | 'big';

interface Options {
  name: string;
  value: string;
  icon: string;
  iconType: string;
  isAll?: true;
}

@Component({
  components: { Popup },
})
export default class SelectPopup extends Vue {
  icons: string[] = [];
  formattedOptions: Record<string, string>[] = [];

  @Prop(String) value!: string;
  @Prop(Array) options!: Options[];
  @Prop(String) headerText!: string;
  @Prop(Number) top!: number;
  @Prop(Number) left!: number;
  @Prop({ default: 'center' }) horizontalPlacement!: string;
  @Prop({ default: 'center' }) verticalPlacement!: string;
  @Prop({ default: 'big' }) space!: SpaceSize;
  @Prop({ default: '' }) placeholder!: string;
  @Prop({ type: Number, required: false }) height?: number;
  @Prop({ type: Number, required: false }) maxHeight?: number;
  @Prop({ default: true }) showIcon!: boolean;
  @Prop({ default: true }) showSearch!: boolean;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: true }) showAnimation!: boolean;
  @Prop({ default: true }) showBackground!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: boolean;

  get showWarning() {
    return this.options.length === 0;
  }

  created() {
    const index = this.options.findIndex(({ value }) => value === this.value);

    if (index === -1) return;

    const selectedElement = this.options[index];
    const indexInsertion = this.options[0]?.isAll && index !== 0 ? 1 : 0;

    this.options.splice(index, 1);
    this.options.splice(indexInsertion, 0, selectedElement);
  }

  getIconVisible(value: string) {
    return this.value === value;
  }

  rowClasses(value: string) {
    return [
      'row',
      {
        'row-active': this.value === value,
      },
      `padding-${this.space}`,
    ];
  }

  toggle(value: string) {
    this.$emit('toggleValue', value);
  }

  isAddressIconType(iconType: string) {
    return iconType === 'address';
  }

  isGlobusIcon(icon: string) {
    return icon === 'globus';
  }
}
</script>

<style lang="scss" scoped>
.select-popup {
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
    color: $plain-white;
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

  .description-name {
    display: flex;
    flex-direction: column;
    font-weight: 400;

    &__token {
      font-size: 12px;
      color: $gray-color;
    }
  }
}
</style>
