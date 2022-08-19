<template>
  <TransactionLayout>
    <template slot="content">
      <div class="qr-container">
        <Corners class="corners" size="big">
          <span>Fearless connect mobile QR code</span>
          <img class="qr-code" :src="qr" v-if="qr" />
        </Corners>
        <span>OR</span>
      </div>
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Continue with Exension" />
      <Button size="mini" type="link" text="Cancel" />
    </template>
  </TransactionLayout>
</template>

<script>
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
  qr = '';
  get qr() {
    return this.qr;
  }

  set qr(value) {
    this.qr = value;
  }

  mounted() {
    QRCode.toDataURL('Soramitsu').then((url) => {
      this.qr = url;
    });
  }
}
</script>

<style lang="scss" scoped>
.qr-container {
  display: grid;
  grid-template-rows: 3fr 1fr;
  place-content: center;
  height: 100%;
}
.corners {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: column;
}
.qr-code {
  width: 222px;
}
</style>
