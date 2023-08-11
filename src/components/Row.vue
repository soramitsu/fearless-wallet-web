<template>
  <div :class="internalRowClasses" v-on="$listeners">
    <div class="label">
      <slot></slot>
    </div>

    <div v-if="value" :class="valueClasses">
      <div>
        <Loading v-if="isLoading" />

        <span v-else>{{ value }}</span>
      </div>

      <div v-if="price" class="price">
        {{ price }}
      </div>
    </div>
    <div v-else>-</div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

type BorderType = 'default' | 'secondary';
type Color = 'white' | 'pink-lavender';

@Component
export default class Row extends Vue {
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop({ default: 'white' }) color!: Color;
  @Prop({ default: true }) hideLastBorder!: boolean;
  @Prop({ default: 'secondary' }) borderType!: BorderType;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop(Boolean) isLoading!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get internalRowClasses() {
    const classes = ['row'];

    if (this.showBorder) classes.push(`border-${this.borderType}`);

    if (this.hideLastBorder) classes.push(`border-last`);

    return classes;
  }

  get valueClasses() {
    const classes = ['value', `color-${this.color}`];

    return classes;
  }
}
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

.row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .value {
    text-align: right;
    text-transform: uppercase;

    .price {
      color: $gray-color;
      margin-top: 3px;
    }
  }

  .label {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
  }
}
</style>
