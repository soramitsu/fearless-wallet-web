<template>
  <AboveForm v-if="isQRshown" :header="header" :closeHandler="close">
    <template v-if="!requestInfo && qrPayload">
      <span>{{ qrCodeHeader }}</span>
      <QR :payload="qrPayload" />
    </template>
    <Loader v-else-if="!requestInfo && !qrPayload" />

    <PermissionRequest v-if="requestInfo" :requestInfo="requestInfo" />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { keyring } from '@polkadot/ui-keyring';
import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import { Action } from 'vuex-class';
import { encodeAddress } from '@polkadot/util-crypto';
import type { SetSelectedWallet } from '@/store/accounts/types';
import { PermissionSuccess, TAction, RequestSentInfo } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { createAddress } from '@/extension/messaging';
import { fearlessConnector } from '@/controllers/beaconController';
import { Components } from '@/router/routes';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import Button from '@/components/Button.vue';
import AboveForm from '@/components/AboveForm.vue';
import QR from '@/components/QR.vue';
import Loader from '@/components/Loader.vue';
import PermissionRequest from '@/screens/beaconUI/PermissionRequest.vue';

@Component({
  components: {
    Loader,
    QR,
    AboveForm,
    PermissionRequest,
    Button,
  },
})
export default class BeaconConnect extends Vue {
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  isQRshown = true;
  qrPayload = '';
  isRequest = false;
  requestInfo: RequestSentInfo | null = null;
  qrCodeHeader = 'Scan the QR code using the Fearless mobile app';
  async mounted() {
    fearlessConnector.connect();
    this.initBeaconEvents();
  }

  initBeaconEvents() {
    fearlessConnector.onPairingRequest(this.onPairingRequest);
    fearlessConnector.onPermissionRequest(this.onPermissionRequest);
    fearlessConnector.onPermissionsResponse(this.onPermissionResponse);
  }

  close() {
    this.$router.back();
  }
  get header() {
    if (this.requestInfo) return `Requesting...`;

    return 'Connect Mobile Wallet';
  }
  async onPairingRequest(payload: string) {
    this.qrPayload = payload;
    this.isQRshown = true;
  }

  async onPermissionRequest(payload: RequestSentInfo) {
    this.requestInfo = payload;
    console.log(this.requestInfo, 'request info');
    setTimeout(() => {
      this.isRequest = true;
    }, 2000);
  }

  async onPermissionResponse(payload: PermissionSuccess) {
    const { address } = payload.account;
    const meta: KeyringJson$Meta = {
      name: 'beacon_acc',
    };
    const substrateAccount = encodeAddress(payload.account.address);

    if (BaseApi.getAddressType(substrateAccount)) {
      fearlessConnector.disconnect();

      return;
    }

    keyring.saveAddress(address, meta, 'address');

    await createAddress(meta, address); //extenstion service worker
    this.setSelectedWallet({ selectedWalletAddress: address });

    this.isQRshown = false;
    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}
</style>
