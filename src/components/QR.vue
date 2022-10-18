<template>
  <img :src="qr" class="qr-code" />
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import QRCode from 'qrcode';

@Component
export default class QR extends Vue {
  qr = '';

  @Prop(String) payload!: string;
  @Prop({ default: 5 }) margin!: number;
  @Prop({ default: 300 }) width!: number;
  @Prop({ default: '#111111' }) foreground!: string;
  @Prop({ default: '#FFFFFF' }) background!: string;

  @Watch('payload')
  async createQR() {
    this.qr = await QRCode.toDataURL(this.payload, {
      margin: this.margin,
      width: this.width,
      color: {
        dark: this.foreground,
        light: this.background,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.qr-code {
  border-radius: 24px;
}
</style>
