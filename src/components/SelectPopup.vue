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
      v-for="{ name, value, icon, iconType, subName } in sortedOptions"
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

        <div v-if="subName" class="description-name">
          {{ name }}
          <span class="description-name__token">
            {{ subName }}
          </span>
        </div>

        <span v-else>
          {{ name }}
        </span>
      </div>

      <Icon icon="check" v-show="getIconVisible(value)" />
    </div>

    <div v-if="showWarning" class="warning" data-testid="warning">Nothing found</div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import Popup from './Popup.vue';

interface Options {
  name: string;
  value: string;
  icon: string;
  iconType: string;
  subName?: string;
  isAll?: true;
}

export default defineComponent({ name: 'SelectPopup',
  components: { Popup },
  props: {
    value: String,
    options: Array,
    headerText: String,
    top: Number,
    left: Number,
    horizontalPlacement: { default: 'center' },
    verticalPlacement: { default: 'center' },
    space: { default: 'big' },
    placeholder: { default: '' },
    height: { type: Number, required: false },
    maxHeight: { type: Number, required: false },
    showIcon: { default: true },
    showSearch: { default: true },
    showBorder: { default: true },
    showBlur: { default: true },
    showAnimation: { default: true },
    showBackground: { default: true },
    sizeWidth: { default: 'medium' },
  },
  data() {
    return {
      icons: [],
      formattedOptions: [],
    };
  },
  computed: {
    showWarning() {
      return this.options.length === 0;
    },
    sortedOptions(): Options[] {
      const options = [...(this.options as Options[])];
      const index = options.findIndex(({ value }) => value === this.value);

      if (index === -1) return options;

      const [selectedElement] = options.splice(index, 1);
      const indexInsertion = options[0]?.isAll && index !== 0 ? 1 : 0;
      options.splice(indexInsertion, 0, selectedElement);

      return options;
    },
  },
  methods: {
    getIconVisible(value: string) {
      return this.value === value;
    },
    rowClasses(value: string) {
      return [
            'row',
            {
              'row-active': this.value === value,
            },
            `padding-${this.space}`,
          ];
    },
    toggle(value: string) {
      this.$emit('toggleValue', value);
    },
    isAddressIconType(iconType: string) {
      return iconType === 'address';
    },
    isGlobusIcon(icon: string) {
      return icon === 'globus';
    },
  },
});
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
      border-radius: 50%;
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
      font-size: 0.75rem;
      color: $gray-color;
    }
  }
}
</style>
