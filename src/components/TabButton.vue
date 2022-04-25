<template>
  <div :class="tabButtonClasses">{{ name }}</div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop({ default: false }) isActive!: boolean;
  @Prop({ default: true }) background!: boolean;

  get tabButtonClasses() {
    return [
      'tab-button',
      {
        background: this.background,
      },
      {
        'no-background': !this.background,
      },
      {
        'active-background': this.background && this.isActive,
      },
      {
        'active-no-background': !this.background && this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.tab-button {
  background: none;
  padding: 8px 15px;
  clip-path: var(--mini-clip-path-left-top-and-right-bottom);
  border-radius: 4px;

  &:hover {
    cursor: pointer;
  }
}

.background {
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.active-background {
  background-color: rgba(119, 0, 238, 0.25);
}

.no-background {
  color: rgba(255, 255, 255, 0.65);
}

.active-no-background {
  font-weight: 600;
  color: rgba(255, 255, 255, 1);
}
</style>
