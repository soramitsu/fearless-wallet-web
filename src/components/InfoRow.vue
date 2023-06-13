<template>
  <div class="row">
    <div class="label">
      {{ $t(text) }}

      <Icon v-if="icon" :icon="icon" class="icon-info" :class="classes" />
    </div>

    <div v-if="value" class="value">
      <div>{{ value }}</div>

      <div v-if="price" class="price">{{ price }}</div>
    </div>
    <div v-else>-</div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon!: string;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get classes() {
    return ['icon-info', ...this.iconClasses];
  }
}
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

    .icon-info {
      margin-left: 13px;
      width: 18px;
      height: 18px;
      color: $grayish-white;
      cursor: pointer;

      &:hover {
        color: $default-white;
      }
    }
  }
}
</style>
