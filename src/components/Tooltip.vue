<template>
  <div class="tooltip"></div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import type { Placement } from '@/interfaces';
import type { Props } from 'tippy.js';

@Component
export default class Tooltip extends Vue {
  @Prop(String) text!: string;
  @Prop({ default: () => ({}) }) textLocaleProps!: Record<string, string>;
  @Prop(String) target!: string;
  @Prop({ default: 'top' }) placement!: Placement;
  @Prop(String) trigger!: string;

  mounted() {
    if (!this.target) return;

    const options: Partial<Props> = {
      content: this.$t(this.text, this.textLocaleProps) as string,
      placement: this.placement,
      arrow: false,
      animation: 'shift-toward-extreme',
      delay: [1500, 0],
      duration: 0,
    };

    if (this.trigger) {
      options.trigger = this.trigger;
      options.delay = 0;
    }

    tippy(this.target, options);
  }
}
</script>

<style lang="scss" scoped></style>
