<template>
  <div class="tooltip"></div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import tippy from 'tippy.js';
import type { Props } from 'tippy.js';

export default defineComponent({ name: 'Tooltip' ,
  props: {
    text: { default: '' },
    target: String,
    placement: { default: 'top' },
    arrow: { default: false },
    maxWidth: { default: 250 },
    delay: { default: 1500 },
    trigger: String,
  },
  data() {
    return {
      tooltips: [],
    };
  },
  computed: {
    language() {
      return this.$i18n.locale;
    },
  },
  watch: {
    "language": 'createTooltip',
  },
  mounted() {
    this.createTooltip();
  },
  beforeUnmount() {
    this.tooltips.forEach((item) => item.destroy());
  },
  methods: {
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
            onShow(instance) {
              if (this.trigger === 'click')
                setTimeout(() => {
                  instance.hide();
                }, 1000);
            },
          };

          if (this.trigger) {
            options.trigger = this.trigger;
            options.delay = 0;
          }

          this.tooltips = tippy(this.target, options);
    },
  },
});
</script>
