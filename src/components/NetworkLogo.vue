<template>
  <Icon :icon="iconName" :style="style" :alt="name" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import type { RelayChainName } from '@/interfaces';
import { getIconName } from '@/helpers/imgPath';

@Component
export default class NetworkLogo extends Vue {
  @Prop(String) name!: string;
  @Prop(String) relayChain!: RelayChainName;
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
    if (this.name === '') return '';

    return getIconName(this.name, this.relayChain);
  }
}
</script>
