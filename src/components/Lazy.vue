<template>
  <div :ref="targetRef">
    <slot v-if="shouldRender" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Currencies extends Vue {
  readonly targetRef = 'target';
  shouldRender = false;

  @Prop({ default: 0 }) threshold!: number;
  @Prop({ default: null }) root!: Element | Document | null;
  @Prop({ default: '0px' }) rootMargin!: string;

  get options() {
    const options: IntersectionObserverInit = {
      root: this.root,
      threshold: this.threshold,
      rootMargin: this.rootMargin,
    };

    return options;
  }

  mounted() {
    const el = this.$refs[this.targetRef] as Element;
    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(({ isIntersecting }) => {
        if (isIntersecting) {
          this.shouldRender = true;

          observer.unobserve(el);
        }
      });
    }, this.options);

    observer.observe(el);
  }
}
</script>
