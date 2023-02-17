<template>
  <img :src="iconName" :style="style" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';

import type { RelayChainName } from '@/interfaces';
import { getIconName } from '@/helpers/imgPath';

@Component
export default class ExternalLogo extends Vue {
  @Prop(String) name!: string;
  @Prop({ required: false, type: String }) relayChain?: RelayChainName;
  @Prop({ default: 'asset', type: String }) type!: 'asset' | 'network' | 'fiat';
  @Prop({ default: 32 }) width!: number;
  urlTypes: Record<string, string> = {
    asset: 'https://raw.githubusercontent.com/soramitsu/fearless-utils/master/icons/tokens/',
    network: 'https://raw.githubusercontent.com/soramitsu/fearless-utils/master/icons/chains/',
    fiat: 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.2/icons/fiat/',
  };

  get style() {
    const styles: Record<string, string> = {};

    if (this.width) {
      styles.width = `${this.width}px`;
      styles.height = `${this.width}px`;
    }

    return styles;
  }

  get urlType() {
    return this.urlTypes[this.type];
  }

  get iconType() {
    if (this.type === 'fiat') return '';

    return this.type === 'asset' ? 'coloured' : 'white';
  }

  get iconName() {
    if (this.name === undefined || this.name === '') return '';

    const name = getIconName(this.name, this.relayChain);
    const isNeedUpperCase = this.type === 'asset' && this.name !== 'csm';

    const prepName = isNeedUpperCase ? name.toUpperCase() : name;

    return `${this.urlType}${this.iconType}/${prepName}.svg`;
  }
}
</script>
