<template>
  <div class="total-balance" @click="$emit('click')">
    <div>
      <div v-if="name" class="name">{{ name }}</div>
      <div class="balance">${{ balanceString }}</div>
      <div :class="percentClasses">{{ percentString }}</div>
    </div>
    <s-icon name="basic-check-mark-24" v-show="showIcon" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class TotalBalance extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop(Number) balance!: number;
  @Prop(Number) percent!: number;
  @Prop({ default: false }) showIcon!: boolean;

  get balanceString() {
    return this.balance.toFixed(2);
  }

  get percentString() {
    return `${this.percent > 0 ? '+' : ''}${this.percent.toFixed(2)}%`;
  }

  get percentClasses() {
    return ['percent', this.percent >= 0 ? 'percent-plus' : 'percent-minus'];
  }
}
</script>

<style lang="scss" scoped>
.total-balance {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  opacity: 0.95;

  &:hover {
    cursor: pointer;
    opacity: 1;
  }

  .name {
    margin-bottom: 4px;
  }

  .balance {
    font-weight: 800;
    font-size: 22px;
    line-height: 28px;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
  }

  .percent-plus {
    color: #00ffcc;
  }

  .percent-minus {
    color: #d0021b;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }
}
</style>
