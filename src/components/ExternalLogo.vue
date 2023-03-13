<template>
  <img :src="iconName" :style="style" :alt="name" :width="width" :height="width" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import NetworksController from '@/controllers/networksController';

@Component
export default class ExternalLogo extends Vue {
  @Prop(String) name!: string;
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

    if (this.name.startsWith('https://')) return this.name;

    const assetIcon = NetworksController.getAssetIcon(this.name);
    const networkIcon = NetworksController.getNetwork(this.name)?.icon;

    return assetIcon || networkIcon || this.name;
  }
}
</script>
