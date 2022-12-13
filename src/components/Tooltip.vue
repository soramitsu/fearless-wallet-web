<template>
  <div class="tooltip"></div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import type { Placement, ComponentText } from '@/interfaces';
import type { Props, Instance } from 'tippy.js';

@Component
export default class Tooltip extends Vue {
  tooltips: Instance<Props>[] = [];

  @Prop({ default: '' }) text!: ComponentText;
  @Prop(String) target!: string;
  @Prop({ default: 'top' }) placement!: Placement;
  @Prop(String) trigger?: string;

  get language() {
    return this.$root.$i18n.locale;
  }

  mounted() {
    this.createTooltip();
  }

  @Watch('language')
  createTooltip() {
    if (!this.target) return;

    this.tooltips.forEach((item) => item.destroy());

    const content = typeof this.text === 'string' ? this.$t(this.text) : this.$t(this.text.text, this.text.localeProps);

    const options: Partial<Props> = {
      content: content as string,
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

    this.tooltips = tippy(this.target, options);
  }
}
</script>

<style lang="scss" scoped></style>
