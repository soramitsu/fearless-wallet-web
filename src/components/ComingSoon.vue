<template>
  <div class="coming-soon">
    <img :src="getImg()" class="img" />

    <div class="name">{{ name }} in developing</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { MenuItems } from '@/interfaces/common';

@Component
export default class ComingSoon extends Vue {
  @Prop(String) name!: string;

  getImg() {
    const name = this.name === MenuItems.dex ? 'polkaswap' : this.name.toLowerCase();

    return require(`@/assets/${name}.svg`);
  }
}
</script>

<style lang="scss" scoped>
.coming-soon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;

  .name {
    margin-top: 25px;
    color: rgba(255, 255, 255, 0.3);
  }

  .img {
    height: 100px;
    filter: invert(0.65);
  }
}
</style>
