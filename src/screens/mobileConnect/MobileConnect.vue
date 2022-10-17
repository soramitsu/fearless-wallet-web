<template>
  <AboveForm :header="header" :closeHandler="close">
    <template v-if="isQRPrep">
      <h2 class="header">{{ qrCodeHeader }}</h2>
      <QR :payload="qrPayload" />
    </template>

    <Alert v-else-if="isActiveAccountExists" :message="activeAccountExistMessage" />

    <div v-else-if="isLoading" class="loader">
      <Loader />
    </div>

    <PermissionRequest v-if="isAwaitWalletResponse" :requestInfo="requestInfo" />

    <template v-if="isPermissionsGranted">
      <div class="permission__content">
        <Alert v-if="isWalletAlreadyExists" />

        <InfoList v-else>
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
import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import { Action } from 'vuex-class';
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
import PermissionRequest from '@/screens/mobileConnect/PermissionRequest.vue';
import InfoList from '@/layouts/InfoList.vue';
import InfoItem from '@/screens/signing/InfoItem.vue';
import Alert from '@/components/Alert.vue';
@Component({
  components: {
    Loader,
    QR,
    InfoList,
    InfoItem,
    Alert,
    Button,
    AboveForm,
    PermissionRequest,
  },
})
export default class MobileConnect extends Vue {
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  qrPayload = '';
  isRequest = false;
  requestInfo: RequestSentInfo | null = null;
  requestResponse: PermissionResponseOutput | null = null;
  qrCodeHeader = 'Scan the QR code using the Fearless mobile app';
  activeAccountExistMessage = 'There is an active connection, please delete mobile wallet and try again';
  isPermissionsGranted = false;
  isWalletAlreadyExists = false;
  isActiveAccountExists = false;

  async mounted() {
    const activeAccount = await beaconController.getActiveAccount();
    console.log(activeAccount, 'active');

    if (activeAccount) {
      this.isActiveAccountExists = true;

      return;
    }

    this.initBeaconEvents();

    beaconController.connect();
  }

  initBeaconEvents() {
    beaconController.onPairingRequest(this.onPairingRequest);
    beaconController.onPermissionRequest(this.onPermissionRequest);
    beaconController.onPermissionsResponse(this.onPermissionResponse);
    beaconController.onPermissionsError((payload) => {
      console.log('PERMISSION ERROR', payload);
    });
  }

  get isLoading() {
    return !this.qrPayload && !this.isActiveAccountExists;
  }

  get isAwaitWalletResponse() {
    return this.requestInfo && !this.isPermissionsGranted && !this.isActiveAccountExists;
  }

  get isQRPrep() {
    return !this.requestInfo && this.qrPayload;
  }

  close() {
    beaconController.disconnect();
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

    const substrateAccount = BaseApi.encodeAddress(payload.account.address);

    if (BaseApi.getAddressType(substrateAccount)) {
      this.isWalletAlreadyExists = true;

      return;
    }

    this.requestResponse = payload.output;

    const meta: KeyringJson$Meta = { name: 'mobile wallet' };

    BaseApi.saveAddress(substrateAccount, meta);

    await createAddress(meta, substrateAccount); //extenstion service worker

    this.setSelectedWallet({ selectedWalletAddress: substrateAccount });

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
