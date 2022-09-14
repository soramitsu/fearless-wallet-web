<template>
  <img :src="imgPath" :style="style" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import { getImgPathByNetworkOrTokenName } from '@/util/imgPath';

@Component
export default class NetworkLogo extends Vue {
  @Prop(String) name!: string;
  @Prop({ default: 32 }) width!: number;

  get style() {
    const styles: Record<string, string> = {};

    if (this.width) styles.width = `${this.width}px`;

    return styles;
  }

  get imgPath() {
    if (this.name === '') return '';

    return require(`@/assets/networks/${getImgPathByNetworkOrTokenName(this.name)}`);
  }
}
</script>

<style></style>
