<template>
  <div :class="classes">
    <img src="../../assets/fw-logo.svg" class="img" />
    {{ text }}
    <s-icon name="chevron-bottom-16" :class="iconClasses" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(Boolean) isActive!: boolean;

  get classes() {
    return [
      'select-network-button',
      {
        active: this.isActive,
      },
    ];
  }

  get iconClasses() {
    return [
      {
        'rotate-180': this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.select-network-button {
  display: flex;
  justify-content: space-between;
  border-radius: 20px;
  background-color: #201c1f;
  height: 36px;
  padding: 6px 12px;
  font-size: 14px;
  align-items: center;
  margin: 0 auto 16px auto;
  border: 1px solid #201c1f;
  z-index: 100;

  &:hover {
    cursor: pointer;
  }

  .img {
    width: 24px;
    margin-right: 7px;
  }

  .s-icon-chevron-bottom-16 {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px !important;
    margin-left: 7px;
  }

  .rotate-180 {
    transform: rotate(180deg);
  }
}

.active {
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
