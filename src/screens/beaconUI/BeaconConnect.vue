<template>
  <AboveForm :header="header" :closeHandler="close">
    <template v-if="!requestInfo && qrPayload">
      <h2 class="header">{{ qrCodeHeader }}</h2>
      <QR :payload="qrPayload" />
    </template>

    <div v-if="!qrPayload" class="loader">
      <Loader />
    </div>

    <PermissionRequest v-if="requestInfo && !isPermissionsGranted" :requestInfo="requestInfo" />

    <template v-if="isPermissionsGranted">
      <div class="permission__content">
        <InfoList>
          <InfoItem name="address" :value="requestResponse.address" />
          <InfoItem name="permissions" :value="requestResponse.scopes[0]" />
        </InfoList>

        <Button size="big" text="Understood" @click="close" />
      </div>
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { keyring } from '@polkadot/ui-keyring';
import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import { Action } from 'vuex-class';
import { encodeAddress } from '@polkadot/util-crypto';
import { PermissionResponseOutput } from '@airgap/beacon-sdk';
import type { SetSelectedWallet } from '@/store/accounts/types';
import { PermissionSuccess, TAction, RequestSentInfo } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { createAddress } from '@/extension/messaging';
import { beaconController } from '@/controllers/beaconController';
import { Components } from '@/router/routes';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import Button from '@/components/Button.vue';
import AboveForm from '@/components/AboveForm.vue';
import QR from '@/components/QR.vue';
import Loader from '@/components/Loader.vue';
import PermissionRequest from '@/screens/beaconUI/PermissionRequest.vue';
import InfoList from '@/layouts/InfoList.vue';
import InfoItem from '@/screens/signing/InfoItem.vue';
@Component({
  components: {
    Loader,
    QR,
    InfoList,
    InfoItem,
    Button,
    AboveForm,
    PermissionRequest,
  },
})
export default class BeaconConnect extends Vue {
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  qrPayload = '';
  isRequest = false;
  requestInfo: RequestSentInfo | null = null;
  requestResponse: PermissionResponseOutput | null = null;
  qrCodeHeader = 'Scan the QR code using the Fearless mobile app';
  isPermissionsGranted = false;

  async mounted() {
    beaconController.connect();
    this.initBeaconEvents();
  }

  initBeaconEvents() {
    beaconController.onPairingRequest(this.onPairingRequest);
    beaconController.onPermissionRequest(this.onPermissionRequest);
    beaconController.onPermissionsResponse(this.onPermissionResponse);
  }

  get isRequestSend() {
    return !this.requestInfo && this.qrPayload;
  }

  close() {
    this.$router.push({ name: Components.Wallet });
  }

  get header() {
    if (this.isPermissionsGranted) return `Permissions granted by ${this.requestInfo?.walletInfo.name}`;
    if (this.requestInfo) return `Requesting...`;

    return 'Connect Mobile Wallet';
  }

  async onPairingRequest(payload: string) {
    this.qrPayload = payload;
  }

  async onPermissionRequest(payload: RequestSentInfo) {
    this.requestInfo = payload;

    setTimeout(() => {
      this.isRequest = true;
    }, 2000);
  }

  async onPermissionResponse(payload: PermissionSuccess) {
    this.isPermissionsGranted = true;
    this.requestResponse = payload.output;

    const { address } = payload.account;

    const meta: KeyringJson$Meta = {
      name: 'beacon_acc',
    };
    const substrateAccount = encodeAddress(payload.account.address);

    if (BaseApi.getAddressType(substrateAccount)) {
      beaconController.disconnect();

      return;
    }

    keyring.saveAddress(address, meta, 'address');

    await createAddress(meta, address); //extenstion service worker
    this.setSelectedWallet({ selectedWalletAddress: address });

    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}

.permission__content {
  height: 100%;
  display: flex;
  flex-flow: column;
  justify-content: space-between;
}

.header {
  padding: 16px;
}

.loader {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
