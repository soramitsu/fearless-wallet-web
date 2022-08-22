<template>
  <TransactionLayout>
    <template slot="content">
      <div class="qr-container">
        <Corners class="qr-wrapper" size="big">
          <span class="qr-header">Fearless connect mobile QR code</span>
          <img class="qr-code" :src="qr" v-if="qr" />
        </Corners>
        <div class="choice">OR</div>
      </div>
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Continue with Exension" />
      <Button size="mini" type="link" text="Cancel" />
    </template>
  </TransactionLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import TransactionLayout from '@/screens/signing/TransactionLayout.vue';
import QRCode from 'qrcode';
import Button from '@/components/Button.vue';
@Component({
  components: {
    TransactionLayout,
    Button,
  },
})
export default class SignRequest extends Vue {
  value = '';
  get qr() {
    return this.value;
  }

  set qr(value: string) {
    this.value = value;
  }

  mounted() {
    QRCode.toDataURL('Soramitsu', {
      width: 222,
      margin: 0,
      color: {
        dark: '#FFFFFF',
        light: '#ffffff00',
      },
    }).then((url: string) => {
      this.qr = url;
    });
  }
}
</script>

<style lang="scss" scoped>
.qr-container {
  height: 100%;
}
.qr-header {
  font-size: 18px;
}
.qr-wrapper {
  position: relative;
  padding: 16px;
  background: #ffffff00;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: grid;
  grid-template-rows: 30px 1fr 1px;
  gap: 55px;
  place-items: start;
  align-items: center;
}
.choice {
  display: block;
  margin-top: 24px;
}
.qr-code {
  place-items: center;
  width: 222px;
  margin: 0 auto;
}
</style>
