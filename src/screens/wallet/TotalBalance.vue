<template>
  <div class="total-balance" @click="$emit('click')">
    <div>
      <div v-if="name" class="name">{{ name }}</div>
      <div class="balance">${{ balanceString }}</div>
      <!-- <div :class="percentClasses">{{ percentString }}</div> -->
    </div>
    <s-icon name="basic-check-mark-24" v-show="showIcon" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { formattedNumber } from '@/util/numbers';

@Component
export default class TotalBalance extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop(String) balance!: string;
  @Prop(Number) percent!: number;
  @Prop({ default: false }) showIcon!: boolean;

  get balanceString() {
    return formattedNumber(+this.balance);
  }

  get percentString() {
    const sign = this.percent > 0 ? '+' : '';
    const signPercent = this.percent !== 0 ? '%' : '';

    return `${sign}${formattedNumber(this.percent)}${signPercent}`;
  }

  get percentClasses() {
    const classes = ['percent'];

    if (this.percent > 0) classes.push('up-percent');
    else if (this.percent < 0) classes.push('down-percent');

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.total-balance {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  height: 46px;

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
    max-width: 220px;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
  }

  .up-percent {
    color: #00ffcc;
  }

  .down-percent {
    color: #d0021b;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }
}
</style>
