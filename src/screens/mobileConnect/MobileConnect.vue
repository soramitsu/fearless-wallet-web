<template>
  <AboveForm :header="header" :closeHandler="close">
    <template v-if="isQRPrep">
      <h2 class="header">{{ qrCodeHeader }}</h2>
      <QR :payload="getQR" />
    </template>

    <Alert v-else-if="isActiveAccountExists" :message="activeMobileAccountExistMessage" />

    <div v-if="isLoading" class="loader">
      <Loader />
    </div>
    <PermissionRequest
      v-if="connectionStatus"
      :status="connectionStatus"
      :requestResponse="requestResponse"
      :requestInfo="requestInfo"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import { Action, Getter, Mutation } from 'vuex-class';
import { PermissionResponseOutput } from '@airgap/beacon-sdk';
import type { SetSelectedWallet } from '@/store/accounts/types';
import { PermissionSuccess, TAction, RequestSentInfo, Networks, BeaconNetworks, TMutation } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { createAddress } from '@/extension/messaging';
import { beaconController } from '@/controllers/beaconController';
import { Components } from '@/router/routes';
import { ActionTypes as AccountActionTypes } from '@/store/accounts/actions';
import { GettersTypes as NetworkGettersTypes } from '@/store/networks/getters';
import { GettersTypes as BeaconGettersTypes } from '@/store/beacon/getters';
import { MutationTypes as BeaconMutationsTypes } from '@/store/beacon/mutations';
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
  @Action(AccountActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;
  @Getter(NetworkGettersTypes.getNetworks) getNetworks!: Networks;
  @Getter(BeaconGettersTypes.GET_QR) getQR!: Nullable<string>;
  @Mutation(BeaconMutationsTypes.SET_QR) setQR!: TMutation<string>;

  requestInfo: RequestSentInfo | null = null;
  requestResponse: PermissionResponseOutput | null = null;
  qrCodeHeader = 'Scan the QR code using the Fearless mobile app';
  activeMobileAccountExistMessage = 'There is an active connection, please delete mobile wallet and try again';
  accountAlreadyExistMessage = 'You already have this wallet';
  isLoading = false;
  isRequest = false;
  isPermissionsGranted = false;
  isWalletAlreadyExists = false;
  isActiveAccountExists = false;
  isPossibleConnectionProblem = false;

  async mounted() {
    this.isLoading = !this.getQR;
    const activeAccount = await beaconController.getActiveAccount();

    if (activeAccount) {
      this.isActiveAccountExists = true;

      return;
    }

    const prepnetworks: BeaconNetworks = this.getNetworks.map((el) => ({ genesisHash: `0x${el.chainId}` }));

    this.initBeaconEvents();

    beaconController.connect(prepnetworks);
  }

  initBeaconEvents() {
    beaconController.onPairingRequest(this.onPairingRequest);
    beaconController.onPairingSuccess(this.onPairingSuccess);
    beaconController.onPermissionRequest(this.onPermissionRequest);
    beaconController.onPermissionsResponse(this.onPermissionResponse);
  }

  get connectionStatus() {
    if (this.isPossibleConnectionProblem && !this.isPermissionsGranted) return 'pendingWithResetForm';
    if (this.isPermissionsGranted) return 'success';
    if (this.isWalletAlreadyExists) return 'failed';

    return false;
  }

  get isAwaitWalletResponse() {
    return this.requestInfo && !this.isPermissionsGranted && !this.isActiveAccountExists;
  }

  get isQRPrep() {
    return !this.connectionStatus && this.getQR && !this.isLoading;
  }

  close() {
    this.$router.push({ name: Components.Main });
  }

  get header() {
    if (this.requestInfo && this.connectionStatus !== 'success' && this.connectionStatus !== 'failed')
      return `Requesting...`;
    if (this.connectionStatus === 'success' || this.connectionStatus === 'failed') return '';

    return 'Connect Mobile Wallet';
  }

  async onPairingRequest(payload: string) {
    this.setQR(payload);
    this.isLoading = false;
  }

  async onPairingSuccess() {
    this.isLoading = true;
  }

  async onPermissionRequest(payload: RequestSentInfo) {
    this.requestInfo = payload;

    setTimeout(() => {
      this.isLoading = false;
      this.isPossibleConnectionProblem = true;
    }, 15000);
  }

  async onPermissionResponse(payload: PermissionSuccess) {
    this.isPossibleConnectionProblem = false;
    this.isLoading = false;

    this.requestResponse = payload.output;

    if (BaseApi.getAddressType(payload.account.address)) {
      this.isWalletAlreadyExists = true;
      beaconController.resetConnection();

      return;
    }

    const substrateAccount = BaseApi.encodeAddress(payload.account.address);

    this.isPermissionsGranted = true;

    const meta: KeyringJson$Meta = { name: 'mobile wallet' };

    BaseApi.saveAddress(substrateAccount, meta);

    await createAddress(substrateAccount, meta); //extenstion service worker

    this.setSelectedWallet({ selectedWalletAddress: substrateAccount });
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
