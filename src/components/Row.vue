<template>
  <div :class="internalRowClasses" v-on="$listeners">
    <div class="label">
      <slot></slot>

      <Icon v-if="icon" :icon="icon" class="icon-info" :class="iconClasses" />
    </div>

    <div v-if="value" :class="valueClasses">
      <div>
        <div class="value-container">
          <Loading v-if="isLoading" />

          <span v-else>{{ value }}</span>
        </div>

        <div v-if="price" class="price">
          <span>{{ price }}</span>
        </div>
      </div>
      <slot name="details"></slot>
    </div>
    <div v-else>-</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
type BorderType = 'default' | 'secondary';
type Color = 'white' | 'pink-lavender';

type Props = {
  value?: string;
  price?: string;
  color?: Color;
  icon?: string;
  rowClasses?: string;
  isLoading?: boolean;
  isIconPrepend?: boolean;
  iconClasses?: string[];
  showBorder?: boolean;
  borderType?: BorderType;
  hideLastBorder?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  isIconPrepend: false,
  showBorder: true,
  hideLastBorder: true,
  borderType: 'secondary',
  color: 'white',
  iconClasses: () => [],
});

const iconColor = computed(() => {
  if (props.icon === 'check') return '#00ee77';

  return '$grayish-white';
});

const valueClasses = computed(() => ['value', `color-${props.color}`]);

const internalRowClasses = computed(() => {
  const classes = ['row'];

  if (props.showBorder) classes.push(`border-${props.borderType}`);

  if (props.hideLastBorder) classes.push('border-last');

  return classes;
});

const direction = ref(() => (props.isIconPrepend ? 'row' : 'row-reverse'));
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

.value-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  line-height: 19px;
  gap: 4px;
  text-transform: uppercase;
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
      color: $grayish-white;
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
