<template>
  <div :class="internalRowClasses" v-on="$listeners">
    <div class="label" data-testid="label">
      <slot></slot>

      <Icon v-if="icon" :icon="icon" class="icon-info" :class="iconClasses" />
    </div>

    <div v-if="isExistValue" :class="valueClasses">
      <div>
        <div class="value-container">
          <Loading v-if="isLoading" :width="28" />

          <div v-else class="value-line">
            <Icon
              v-if="iconValue"
              :icon="iconValue"
              :hover="hoverIconValue"
              :iconColor="iconValueColor"
              class="icon-value"
              @click="emit('click')"
            />

            <span data-testid="value">{{ value }}</span>
          </div>
        </div>

        <div v-if="price && !isLoading" class="price">
          <span data-testid="price">{{ price }}</span>
        </div>
      </div>

      <slot name="details"></slot>
    </div>

    <div v-else>-</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
type BorderType = 'default' | 'secondary';
type Color = 'white' | 'pink-lavender';

type Props = {
  value?: string;
  price?: string;
  color?: Color;
  isHoverRow?: boolean;

  icon?: string;
  isIconPrepend?: boolean;

  iconValue?: string;
  hoverIconValue?: boolean;
  isIconValuePrepend?: boolean;

  rowClasses?: string;
  isLoading?: boolean;
  iconClasses?: string[];
  showBorder?: boolean;
  borderType?: BorderType;
  hideLastBorder?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  isIconPrepend: false,
  isIconValuePrepend: false,
  isHoverRow: false,
  hoverIconValue: false,
  showBorder: true,
  hideLastBorder: true,
  borderType: 'secondary',
  color: 'white',
  iconClasses: () => [],
});

const emit = defineEmits(['click']);

const iconColor = computed(() => {
  if (props.icon === 'check') return '#00ee77';

  return '$grayish-white';
});

const valueClasses = computed(() => ['value', `color-${props.color}`]);

const iconValueColor = computed(() => (props.iconValue === 'polkaswap' ? 'pink' : undefined));

const isExistValue = computed(() => props.value !== null && props.value !== undefined);

const internalRowClasses = computed(() => {
  const classes = ['row'];

  if (props.showBorder) classes.push(`border-${props.borderType}`);

  if (props.hideLastBorder) classes.push('border-last');

  if (props.isHoverRow) classes.push('row-hover');

  return classes;
});

const direction = computed(() => (props.isIconPrepend ? 'row' : 'row-reverse'));
const directionValue = computed(() => (props.isIconValuePrepend ? 'row' : 'row-reverse'));
</script>

<style lang="scss" scoped>
.color-white {
  color: $default-white;
}

.color-pink-lavender {
  color: $pink-lavender-color;
}

.border-default {
  border-bottom: $default-border;
}

.border-secondary {
  border-bottom: $secondary-border;
}

.border-last {
  &:last-child {
    border: none;
  }
}

.row-hover {
  cursor: pointer;
}

.value-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  line-height: 19px;
  gap: 4px;
  text-transform: uppercase;

  .icon-value {
    width: 18px;
    height: 18px;
  }

  .value-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: fit-content;
    max-width: 300px;
    flex-direction: v-bind(directionValue);
  }
}

.row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid $secondary-background-color;
  color: $default-white;

  .value {
    text-align: right;
    display: flex;
    overflow: hidden;
    text-overflow: ellipsis;

    .price {
      color: $gray-color;
      margin-top: 3px;
    }
  }

  &:last-child {
    border: none;
  }

  .label {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: v-bind(direction);
    gap: 6px;

    .icon-info {
      width: 18px;
      height: 18px;
      color: v-bind('iconColor');
      cursor: pointer;

      &--prepend {
        margin-left: 13px;
      }

      &:hover {
        color: $default-white;
      }
    }
  }
}
</style>
