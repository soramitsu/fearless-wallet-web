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
      v-for="option in displayOptions"
      :key="option.value"
      :class="rowClasses(option.value)"
      @click="toggle(option.value)"
    >
      <div class="description" data-testid="description">
        <template v-if="showIcon">
          <Identicon v-if="isAddressIconType(option.iconType)" :address="option.value" class="img" />

          <Icon v-else-if="isGlobusIcon(option.icon)" :icon="option.icon" className="img" />

          <ExternalLogo v-else :name="option.icon" class="img" />
        </template>

        <div v-if="option.subName" class="description-name">
          {{ option.name }}
          <span class="description-name__token">
            {{ option.subName }}
          </span>
        </div>

        <span v-else>
          {{ option.name }}
        </span>
      </div>

      <SIcon name="basic-check-mark-24" v-show="getIconVisible(option.value)" />
    </div>

    <div v-if="showWarning" class="warning" data-testid="warning">Nothing found</div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, toRefs } from 'vue';
import Popup from './Popup.vue';

type SpaceSize = 'small' | 'medium' | 'big';

type HorizontalPlacement = 'left' | 'center' | 'right';
type VerticalPlacement = 'top' | 'bottom' | 'center';

type Options = {
  name: string;
  value: string;
  icon: string;
  iconType: string;
  isAll?: true;
  subName?: string;
};

type Props = {
  value: string;
  options: Options[];
  headerText?: string;
  top?: number;
  left?: number;
  horizontalPlacement?: HorizontalPlacement;
  verticalPlacement?: VerticalPlacement;
  space?: SpaceSize;
  placeholder?: string;
  height?: number;
  maxHeight?: number;
  showIcon?: boolean;
  showSearch?: boolean;
  showBorder?: boolean;
  showBlur?: boolean;
  showAnimation?: boolean;
  showBackground?: boolean;
  sizeWidth?: string;
};

const emit = defineEmits<{
  (_event: 'handlerFilter', ..._args: unknown[]): void;
  (_event: 'handlerClose'): void;
  (_event: 'toggleValue', _value: string): void;
}>();

const rawProps = withDefaults(defineProps<Props>(), {
  headerText: '',
  top: 0,
  left: 0,
  horizontalPlacement: 'center',
  verticalPlacement: 'center',
  space: 'big',
  placeholder: '',
  showIcon: true,
  showSearch: true,
  showBorder: true,
  showBlur: true,
  showAnimation: true,
  showBackground: true,
  sizeWidth: 'medium',
});

const { value, options, space, showIcon } = toRefs(rawProps);

const displayOptions = computed(() => {
  const list = [...options.value];
  const index = list.findIndex(({ value: optionValue }) => optionValue === value.value);

  if (index === -1) return list;

  const [selectedElement] = list.splice(index, 1);
  const indexInsertion = list[0]?.isAll && index !== 0 ? 1 : 0;

  list.splice(indexInsertion, 0, selectedElement);

  return list;
});

const showWarning = computed(() => displayOptions.value.length === 0);

const getIconVisible = (optionValue: string) => value.value === optionValue;

const rowClasses = (optionValue: string) => [
  'row',
  {
    'row-active': value.value === optionValue,
  },
  `padding-${space.value}`,
];

const toggle = (optionValue: string) => {
  emit('toggleValue', optionValue);
};

const isAddressIconType = (iconType: string) => iconType === 'address';
const isGlobusIcon = (icon: string) => icon === 'globus';
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
