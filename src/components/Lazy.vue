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
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ isIntersecting }) => {
        if (this.isTimeout) this.timeoutCallback(() => this.updateShouldRender(isIntersecting));
        else this.updateShouldRender(isIntersecting);
      });
    }, this.options);

    observer.observe(el);
  }

  updateShouldRender(value: boolean) {
    this.shouldRender = value;
  }
}
</script>
