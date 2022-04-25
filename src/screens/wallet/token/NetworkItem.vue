<template>
  <div :class="classes" @click="openNetwork">
    <div class="left-part">
      <img :src="getImg()" class="img" />

      <div class="name">{{ networkNameWithFirstCharUp }}</div>
    </div>

    <div class="balance balance-color">{{ balance }} {{ token }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { getIconPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/stringHelper';
import { Components } from '@/router/routes';

@Component
export default class extends Vue {
  @Prop(String) network!: string;
  @Prop(Number) balance!: number;
  @Prop(String) token!: string;
  @Prop({ default: false }) isActive!: boolean;

  get classes() {
    return [
      'network-item',
      {
        'network-item-active': this.isActive,
      },
    ];
  }

  get networkNameWithFirstCharUp() {
    return firstCharToUp(this.network);
  }

  getImg() {
    return require(`@/assets/networks/${getIconPathByNetworkName(this.network)}`);
  }

  openNetwork() {
    if (this.isActive) return;

    this.$router.push({
      name: Components.Token,
      params: {
        token: this.token,
        network: this.network,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.network-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 14px 16px 14px 18px;
  color: rgba(255, 255, 255, 0.75);

  &:first-child {
    margin-top: 11px;
  }

  &:hover {
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 1);

    .img {
      opacity: 0.65;
    }
  }

  .left-part {
    display: flex;

    .img {
      width: 20px;
      margin-right: 12px;
      opacity: 0.65;
    }

    .name {
      font-weight: 600;
    }
  }

  .balance {
    font-weight: 700;
  }

  .balance-color {
    color: rgba(255, 255, 255, 0.65);
  }
}

.network-item-active {
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 1);

  .balance-color {
    color: rgba(255, 255, 255, 1);
  }

  .img {
    opacity: 1 !important;
  }
}
</style>
