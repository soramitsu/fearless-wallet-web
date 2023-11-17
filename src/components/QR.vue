<template>
  <div class="qr-wrapper">
    <img :src="qr" :class="QRClasses" />

    <Icon v-if="showLogo" className="logo-qr" icon="logo-qr" />
  </div>
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
  @Prop({ default: false }) showLogo!: string;

  get QRClasses() {
    return [
      'qr-code',
      {
        'qr-code-margin': this.showLogo,
      },
    ];
  }

  async mounted() {
    this.createQR();
  }

  @Watch('payload')
  async createQR() {
    if (!this.payload) return;

    this.qr = await QRCode.toDataURL(this.payload, {
      margin: this.margin,
      width: this.width,
      maskPattern: 5,
      errorCorrectionLevel: 'M',
      color: {
        dark: this.foreground,
        light: this.background,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.qr-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;

  .qr-code {
    border-radius: 24px;
  }

  .qr-code-margin {
    margin-left: 65px;
    border-radius: 24px;
  }

  .logo-qr {
    position: relative;
    color: $pink-color;
    width: 65px;
    height: 30px;
    left: calc(-50% + 32.5px);
  }
}
</style>
