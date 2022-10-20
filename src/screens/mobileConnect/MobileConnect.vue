<template>
  <AboveForm :header="header" :closeHandler="close">
    <template v-if="getQR">
      <h2 class="header">{{ qrCodeHeader }}</h2>
      <QR :payload="getQR" />
    </template>

    <Alert v-else-if="isActiveAccountExists" :message="activeAccountExistMessage" />

    <div v-else-if="isLoading" class="loader">
      <Loader />
    </div>

    <PermissionRequest v-if="isAwaitWalletResponse" :requestInfo="requestInfo" />

    <template v-if="isPermissionsGranted">
      <div class="permission__content">
        <Alert v-if="isWalletAlreadyExists" :message="accountAlreadyExistMessage" />

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

  isRequest = false;
  requestInfo: RequestSentInfo | null = null;
  requestResponse: PermissionResponseOutput | null = null;
  qrCodeHeader = 'Scan the QR code using the Fearless mobile app';
  activeMobileAccountExistMessage = 'There is an active connection, please delete mobile wallet and try again';
  accountAlreadyExistMessage = 'You already have this wallet';
  isPermissionsGranted = false;
  isWalletAlreadyExists = false;
  isActiveAccountExists = false;

  async mounted() {
    const activeAccount = await beaconController.getActiveAccount();
    const prepnetworks: BeaconNetworks = this.getNetworks.map((el) => {
      return {
        genesisHash: `0x${el.chainId}`,
      };
    });

    if (activeAccount) {
      this.isActiveAccountExists = true;

      return;
    }

    this.initBeaconEvents();

    beaconController.connect(prepnetworks);
  }

  initBeaconEvents() {
    beaconController.onPairingRequest(this.onPairingRequest);
    beaconController.onPermissionRequest(this.onPermissionRequest);
    beaconController.onPermissionsResponse(this.onPermissionResponse);
  }

  get isLoading() {
    return !this.getQR && !this.isActiveAccountExists;
  }

  get isAwaitWalletResponse() {
    return this.requestInfo && !this.isPermissionsGranted && !this.isActiveAccountExists;
  }

  get isQRPrep() {
    return !this.requestInfo && this.getQR;
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
    this.setQR(payload);
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
      beaconController.resetConnection();

      return;
    }

    this.requestResponse = payload.output;

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
