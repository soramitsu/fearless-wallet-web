<template>
  <Row
    :value="value"
    :price="price"
    :icon="icon"
    :isLoading="isLoading"
    :borderType="borderType"
    :showBorder="showBorder"
    :hideLastBorder="hideLastBorder"
    :color="color"
  >
    {{ $t(text) }}

    <Icon v-if="icon" :icon="icon" :class="classesIcon" />
  </Row>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Row from './Row.vue';

type BorderType = 'default' | 'secondary';
type Color = 'default' | 'pink-lavender';

@Component({
  components: { Row },
})
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon?: string;
  @Prop(String) color!: Color;
  @Prop({ default: 'secondary' }) borderType!: BorderType;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) hideLastBorder!: boolean;
  @Prop({ default: false }) isLoading!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get classesIcon() {
    return ['icon-info', ...this.iconClasses];
  }
}
</script>

<style lang="scss" scoped>
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
</style>
