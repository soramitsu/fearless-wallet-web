<template>
  <TransactionContent>
    <template slot="control">
      <Button size="big" class="button" text="Continue with Exension" @click="withExtension" />

      <Button v-if="isBeaconAvailible" size="big" class="button" text="Continue with Beacon" @click="withExtension" />

      <Alert v-else :message="beaconNotAvailibleAlertMessage" />

      <Button size="mini" type="link" text="Cancel" @click="onCancel" />
    </template>
  </TransactionContent>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { ResponseSigning } from '@polkadot/extension-base/background/types';
import QrCode from 'qrcode.vue';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import { SelectedWallet } from '@/store/accounts/types';
import { fearlessConnector } from '@/controllers/beaconController';
import { ActionTypes as SignActionTypes } from '@/store/sign/actions';
import { Components } from '@/router/routes';
import TransactionContent from '@/layouts/TransactionContent.vue';
import Button from '@/components/Button.vue';
import Corners from '@/components/Corners.vue';

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
  @Getter('getSignRequestPayload') payload!: SignerPayloadJSON;
  @Getter('getSelectedWallet') setSelectedWallet!: SelectedWallet;

  beaconNotAvailibleAlertMessage = 'Connect your mobile phone with Beacon to sign transactions on mobile device';
  value = '';

  get isBeaconAvailible() {
    return this.setSelectedWallet.isBeaconConnected;
  }

  withExtension() {
    this.$router.push({ name: Components.Transaction });
  }

  withBeacon() {
    fearlessConnector.sendRequest(this.payload);
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
  padding: $default-padding;
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
