<template>
  <div :class="rowClasses">
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

type BorderType = 'default' | 'secondary';
type TextSize = 'mini' | 'default';

@Component
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop({ default: 'default' }) textSize!: TextSize;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon!: string;
  @Prop({ default: 'secondary' }) borderType!: BorderType;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) hideLastBorder!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get classes() {
    return ['icon-info', ...this.iconClasses];
  }

  get rowClasses() {
    const classes = ['row'];

    if (this.showBorder) classes.push(`border-${this.borderType}`, `font-${this.textSize}`);

    if (this.hideLastBorder) classes.push(`border-last`);

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.border-default {
  border-bottom: $default-border;
}

.border-secondary {
  border-bottom: $secondary-border;
}

.font-mini {
  font-size: 14px;
}

.font-default {
  font-size: 16px;
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
  color: $default-white;

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
