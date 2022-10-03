<template>
  <img :src="imgPath" :style="style" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import type { RelayChainName } from '@/interfaces/teleport';
import { getImgPath } from '@/helpers/imgPath';

@Component
export default class NetworkLogo extends Vue {
  @Prop(String) name!: string;
  @Prop(String) relayChain!: RelayChainName;
  @Prop({ default: 32 }) width!: number;

  get style() {
    const styles: Record<string, string> = {};

    if (this.width) styles.width = `${this.width}px`;

    return styles;
  }

  get imgPath() {
    if (this.name === '') return '';

    return require(`@/assets/${getImgPath(this.name, this.relayChain)}`);
  }
}
</script>

<style></style>
