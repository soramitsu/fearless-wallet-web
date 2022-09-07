<template>
  <img :src="imgPath" :class="classes" :alt="network" />
</template>

<script lang="ts">
import { Vue, Prop, Component } from 'vue-property-decorator';
import { getImgPathByNetworkName } from '@/util/imgPath';

@Component
export default class NetworkLogo extends Vue {
  @Prop(String) network!: string;
  @Prop({ default: '' }) classes!: string;

  get imgPath() {
    if (this.network === '') return '';

    return require(`@/assets/networks/${getImgPathByNetworkName(this.network)}`);
  }
}
</script>

<style></style>
