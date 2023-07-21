<template>
  <div>
    <Corners>
      <div :class="tabButtonClasses" @click="$emit('click')" :title="title">
        {{ $t(text) }}
      </div>
    </Corners>

    <Tooltip v-if="tooltipText" :text="tooltipText" :target="target" :placement="placementTooltip" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class TabButton extends Vue {
  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) title!: string;
  @Prop({ default: 'top' }) placementTooltip!: string;
  @Prop(String) tooltipText!: string;
  @Prop(String) target!: string;
  @Prop({ default: false }) isActive!: boolean;

  get tabButtonClasses() {
    return [
      'tab-button',
      {
        'active-background': this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.tab-button {
  background-color: $secondary-background-color;
  padding: 0 15px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 36px;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: $default-border;
  height: 36px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }
}

.active-background {
  background-color: $pink-purple-color;
}
</style>
