<template>
  <img :src="iconName" :style="style" :alt="altName" :width="width" :height="width" loading="lazy" decoding="async" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import { NetworksController } from '@/controllers';

@Component
export default class ExternalLogo extends Vue {
  @Prop(String) name!: string;
  @Prop(String) alt?: string;
  @Prop({ default: 32 }) width!: number;

  get altName() {
    return this.alt ?? this.name;
  }

  get style() {
    const styles: Record<string, string> = {};

    if (this.width) {
      styles.width = `${this.width}px`;
      styles.height = `${this.width}px`;
    }

    return styles;
  }

  get altName() {
    return this.alt ?? this.name;
  }

  get iconName() {
    if (this.name === undefined || this.name === '') return '';

    if (this.name.startsWith('https://')) return this.name;

    const networkIcon = NetworksController.getNetwork(this.name)?.icon;

    return networkIcon || this.name;
  }
}
</script>
