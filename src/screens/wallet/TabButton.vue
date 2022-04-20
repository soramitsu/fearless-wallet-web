<template>
  <div :class="tabButtonClasses">{{ name }}</div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop({ default: false }) isActive!: boolean;

  get tabButtonClasses() {
    return [
      'tab-button',
      {
        'tab-button-active': this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.tab-button {
  background: none;
  font-size: 13px;
  padding: 8px 15px;
  margin-right: 12px;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);

  &:hover {
    cursor: pointer;
  }
}

.tab-button-active {
  background-color: rgba(119, 0, 238, 0.25);
}
</style>
