<template>
  <div class="network-item">
    <img :src="getImg()" class="img" />

    <div class="name">{{ networkName }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { getIconPathByNetworkName } from '../../../util/imgPath';

@Component
export default class extends Vue {
  @Prop(String) networkName!: string;

  getImg() {
    return require(`../../../assets/networks/${getIconPathByNetworkName(this.networkName)}`);
  }
}
</script>

<style lang="scss" scoped>
.network-item {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 14px 16px 14px 18px;

  &:hover {
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .name {
    font-weight: 600;
  }

  .img {
    width: 20px;
    margin-right: 12px;
    opacity: 0.65;
  }
}
</style>
