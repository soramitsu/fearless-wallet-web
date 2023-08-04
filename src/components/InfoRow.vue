<template>
  <Row :value="value" :price="price" :icon="icon" :isLoading="isLoading" :rowClasses="rowClasses">
    {{ $t(text) }}

    <Icon v-if="icon" :icon="icon" class="icon-info" :class="classes" />
  </Row>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Row from './Row.vue';

type BorderType = 'default' | 'secondary';

@Component({
  components: { Row },
})
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon?: string;
  @Prop({ default: 'secondary' }) borderType!: BorderType;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) hideLastBorder!: boolean;
  @Prop({ default: false }) isLoading!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get classes() {
    return ['icon-info', ...this.iconClasses];
  }

  get rowClasses() {
    const classes = ['info-row'];

    if (this.showBorder) classes.push(`border-${this.borderType}`);

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

.border-last {
  &:last-child {
    border: none;
  }
}

.info-row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: $default-white;
  font-size: 16px;

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
</style>
