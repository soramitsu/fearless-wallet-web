<template>
  <div class="tooltip"></div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import tippy from 'tippy.js';
import type { Placement, ComponentText } from '@/interfaces';
import type { Props, Instance } from 'tippy.js';

@Component
export default class Tooltip extends Vue {
  tooltips: Instance<Props>[] = [];

  @Prop({ default: '' }) text!: ComponentText;
  @Prop(String) target!: string;
  @Prop({ default: 'top' }) placement!: Placement;
  @Prop({ default: false }) arrow!: boolean;

  @Prop({ default: 250 }) maxWidth!: number;
  @Prop({ default: 1500 }) delay!: number;

  @Prop(String) trigger?: string;

  get language() {
    return this.$root.$i18n.locale;
  }

  mounted() {
    this.createTooltip();
  }

  beforeDestroy() {
    this.tooltips.forEach((item) => item.destroy());
  }

  @Watch('language')
  createTooltip() {
    if (!this.target) return;

    this.tooltips.forEach((item) => item.destroy());

    const content = typeof this.text === 'string' ? this.$t(this.text) : this.$t(this.text.text, this.text.localeProps);

    const options: Partial<Props> = {
      content: content as string,
      placement: this.placement,
      arrow: this.arrow,
      animation: 'shift-toward-extreme',
      delay: [this.delay, 0],
      duration: 0,
      maxWidth: this.maxWidth,
      allowHTML: true,
    };

    if (this.trigger) {
      options.trigger = this.trigger;
      options.delay = 0;
    }

    this.tooltips = tippy(this.target, options);
  }
}
</script>
