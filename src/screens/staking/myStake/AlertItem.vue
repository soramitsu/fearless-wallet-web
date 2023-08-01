<template>
  <div class="alert-item">
    <Icon icon="info-triangle" className="img" />

    <div class="full-descriptions">
      <div class="name">{{ name }}</div>
      <div class="descriptions">{{ descriptions }}</div>
      <div class="date">{{ date }}</div>
    </div>

    <Icon icon="chevron-right" class="img chevron" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { getFormattedDate } from '@/helpers/common';

@Component
export default class AlertItem extends Vue {
  @Prop({ type: String }) name!: string;
  @Prop({ type: String }) descriptions!: string;
  @Prop({ type: Number }) timespan!: number;

  get date() {
    return getFormattedDate(this.timespan, 'ms');
  }
}
</script>

<style lang="scss" scoped>
.alert-item {
  display: flex;
  align-items: flex-start;
  border-bottom: $secondary-border;
  padding: 15px 0;

  &:last-child {
    border-bottom: none;
  }

  .img {
    width: 42px;
    height: 21px;
  }

  .chevron {
    color: $grayish-white-2;
  }

  .full-descriptions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    margin: 0 8px;

    .name {
      font-size: 16px;
      font-weight: 600;
      color: #ffffffcc;
    }

    .descriptions {
      font-size: 14px;
      color: $grayish-white;
      margin: 7px 0;
      width: 425px;
    }

    .date {
      font-size: 12px;
      color: $grayish-white-2;
    }
  }
}
</style>
