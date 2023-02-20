<template>
  <img :src="iconName" :style="style" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

import type { RelayChainName } from '@/interfaces';
import NetworksController from '@/controllers/networksController';

@Component
export default class ExternalLogo extends Vue {
  @Prop(String) name!: string;
  @Prop({ required: false, type: String }) relayChain?: RelayChainName;
  @Prop(String) type!: string;
  @Prop({ default: 32 }) width!: number;

  get style() {
    const styles: Record<string, string> = {};

    if (this.width) {
      styles.width = `${this.width}px`;
      styles.height = `${this.width}px`;
    }

    return styles;
  }

  get iconName() {
    if (this.name === undefined || this.name === '') return '';

    if (this.type === 'asset') {
      return NetworksController.getAssetsIcon(this.name);
    }

    return this.name;
  }
}
</script>
