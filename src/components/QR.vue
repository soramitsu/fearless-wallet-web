<template>
  <img :src="qr" />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import QRCode from 'qrcode';

@Component
export default class QR extends Vue {
  @Prop(String) payload!: string;
  @Prop({
    default: 5,
  })
  margin!: number;
  @Prop({
    default: 300,
  })
  width!: number;
  @Prop({
    default: '#111111',
  })
  foreground!: string;
  @Prop({
    default: '#FFFFFF',
  })
  background!: string;

  qr = '';

  async mounted() {
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
