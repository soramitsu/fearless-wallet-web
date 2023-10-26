<template>
  <div class="row" :class="rowClasses" v-on="$listeners">
    <div class="label">
      <slot></slot>
    </div>

    <div v-if="value" class="value">
      <div>
        <div>
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
import { computed } from 'vue';

type Props = {
  value: string;
  price: string;
  icon?: string;
  rowClasses?: string;
  isLoading: boolean;
  isIconPrepend: boolean;
  iconClasses: string[];
};

const props = withDefaults(defineProps<Props>(), {
  isIconPrepend: false,
  iconClasses: () => [],
});

const direction = computed(() => (props.isIconPrepend ? 'row' : 'row-reverse'));
</script>

<style lang="scss" scoped>
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
