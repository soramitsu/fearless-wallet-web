<template>
  <TransactionContent>
    <template slot="content">
      <div class="qr-container">
        <Corners size="big">
          <div class="qr-wrapper">
            <span class="qr-header">Fearless connect mobile QR code</span>
            <QrCode
              class="qr-code"
              value="Sora"
              :size="200"
              render-as="svg"
              :margin="10"
              foreground="#FFFFFF"
              background="#ffffff00"
            />
          </div>
        </Corners>
        <div class="choice">OR</div>
      </div>
    </template>
    <template slot="control">
      <Button size="big" class="button" text="Continue with Exension" @click="withExtension" />

      <Button size="mini" type="link" text="Cancel" @click="onCancel" />
    </template>
  </TransactionContent>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { ResponseSigning } from '@polkadot/extension-base/background/types';
import QrCode from 'qrcode.vue';
import { Components } from '@/router/routes';
import TransactionContent from '@/layouts/TransactionContent.vue';
import Button from '@/components/Button.vue';
import Corners from '@/components/Corners.vue';
import { ActionTypes as SignActionTypes } from '@/store/sign/actions';

@Component({
  components: {
    TransactionContent,
    Corners,
    QrCode,
    Button,
  },
})
export default class SignRequest extends Vue {
  @Getter('getSignRequest') request!: ResponseSigning;

  value = '';

  withExtension() {
    this.$router.push({ name: Components.Transaction });
  }
  onCancel() {
    this.$store.dispatch(SignActionTypes.SIGN_CANCEL, this.request.id);
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
  grid-template-rows: 30px 1fr 10px;
  gap: 24px;
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
