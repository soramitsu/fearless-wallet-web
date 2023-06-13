<template>
  <div :ref="targetRef">
    <slot v-if="shouldRender" />

    <Shimmer v-else-if="isTimeout" height="100%" width="100%" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Lazy extends Vue {
  readonly targetRef = 'target';
  shouldRender = false;

  @Prop({ default: 0 }) threshold!: number;
  @Prop({ default: null }) root!: Element | Document | null;
  @Prop({ default: '0px' }) rootMargin!: string;
  @Prop({ required: false }) timeoutCallback!: (fn: () => void) => VoidFunction;

  get options() {
    return {
      root: this.root,
      threshold: this.threshold,
      rootMargin: this.rootMargin,
    } as IntersectionObserverInit;
  }

  get isTimeout() {
    return this.timeoutCallback !== undefined;
  }

  mounted() {
    const el = this.$refs[this.targetRef] as Element;
    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(({ isIntersecting }) => {
        if (!isIntersecting) return;

        if (this.isTimeout) this.timeoutCallback(this.setShouldRender);
        else this.setShouldRender();

        observer.unobserve(el);
      });
    }, this.options);

    observer.observe(el);
  }

  setShouldRender() {
    this.shouldRender = true;
  }
}
</script>
