<template>
  <img :src="iconName" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

import type { RelayChainName } from '@/interfaces';
import { getIconName, getImgPathByNetworkOrAssetName } from '@/helpers/imgPath';

@Component
export default class NetworkLogo extends Vue {
  @Prop(String) name!: string;
  @Prop({ required: false, type: String }) relayChain?: RelayChainName;
  @Prop({ default: true, type: Boolean }) isAsset!: boolean;
  @Prop({ default: 32 }) width!: number;

  baseUrl = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/master/icons/tokens/';
  baseUrlChains = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/master/icons/chains/';

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

    const name = getIconName(this.name, this.relayChain);

    return `${this.isAsset ? this.baseUrl : this.baseUrlChains}${this.isAsset ? 'coloured' : 'white'}/${
      this.isAsset ? name.toUpperCase() : name
    }.svg`;
  }
}
</script>
