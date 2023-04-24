<template>
  <AboveForm :header="header" :closeHandler="close">
    <template v-if="isQRPrep">
      <h2 class="header">{{ $t('mobileConnector.qrHeader') }}</h2>

      <QR :payload="getQR" />
    </template>

    <div v-show="isLoading && !isActiveAccountExists" class="loader">
      <Loader />
    </div>

    <PermissionRequestPopup
      v-if="connectionStatus"
      :status="connectionStatus"
      :requestResponse="requestResponse"
      :requestInfo="requestInfo"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Action, Getter, Mutation } from 'vuex-class';
import type { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import type { PermissionResponseOutput } from '@airgap/beacon-sdk';
import type {
  PermissionSuccess,
  AsyncFn,
  RequestSentInfo,
  Networks,
  Fn,
  PermissionResponsePayload,
} from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { createAddress } from '@/extension/messaging';
import { beaconController } from '@/controllers/beaconController';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as NetworkGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountMutationsTypes } from '@/store/accounts/mutations';
import PermissionRequestPopup from '@/screens/mobileConnect/PermissionRequestPopup.vue';
import { MOONBEAM_GENESISHASH } from '@/consts/networks';
import { IS_EXTENSION } from '@/consts/global';

@Component({
  components: { PermissionRequestPopup },
})
export default class MobileConnect extends Vue {
  requestInfo: RequestSentInfo | null = null;
  requestResponse: PermissionResponseOutput | null = null;
  isLoading = false;
  isRequest = false;
  isPaired = false;
  isPermissionsGranted = false;
  isWalletAlreadyExists = false;
  isActiveAccountExists = false;
  isPossibleConnectionProblem = false;
  permissionRequestDenied = false;

  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: AsyncFn<string>;
  @Getter(NetworkGettersTypes.getAllNetworks) getNetworks!: Networks;
  @Getter(AccountsGettersTypes.getQR) getQR!: Nullable<string>;
  @Mutation(AccountMutationsTypes.SET_QR) setQR!: Fn<string>;

  async mounted() {
    this.isLoading = !this.getQR;
    const activeAccount = await beaconController.getActiveAccount();

    if (activeAccount) {
      this.isActiveAccountExists = true;

      return;
    }

    this.initBeaconEvents();

    beaconController.connect();
  }

  initBeaconEvents() {
    beaconController.onPairingRequest(this.onPairingRequest);
    beaconController.onPairingSuccess(this.onPairingSuccess);
    beaconController.onPermissionRequest(this.onPermissionRequest);
    beaconController.onPermissionsResponse(this.onPermissionResponse);
  }

  get connectionStatus() {
    if (this.isActiveAccountExists) return 'active_account_exists';
    if (this.isPossibleConnectionProblem && !this.isPermissionsGranted) return 'reset_form';
    if (this.isPermissionsGranted) return 'success';
    if (this.isWalletAlreadyExists) return 'wallet_exists';
    if (this.permissionRequestDenied) return 'failed';

    return false;
  }

  get isAwaitWalletResponse() {
    return this.requestInfo && !this.isPermissionsGranted && !this.isActiveAccountExists;
  }

  get isQRPrep() {
    return !this.connectionStatus && this.getQR && !this.isLoading;
  }

  close() {
    this.$router.back();
  }

  get isPermissionRequestResolved() {
    return this.connectionStatus === 'success' || this.connectionStatus === 'failed';
  }

  get header() {
    if (this.isPaired && !this.isPermissionRequestResolved) return 'mobileConnector.requesting';

    if (this.isPermissionRequestResolved) return '';

    return 'welcome.connectMobile';
  }

  async onPairingRequest(payload: string) {
    this.setQR(payload);

    this.isLoading = false;
  }

  async onPairingSuccess() {
    this.isPaired = true;
    this.isLoading = true;
  }

  async onPermissionRequest(payload: RequestSentInfo) {
    this.requestInfo = payload;

    setTimeout(() => {
      this.isLoading = false;

      if (!this.isPermissionsGranted || !this.isWalletAlreadyExists) this.isPossibleConnectionProblem = true;
    }, 30000);
  }

  async onPermissionResponse({ output, account }: PermissionSuccess) {
    this.isPossibleConnectionProblem = false;
    this.isLoading = false;

    this.requestResponse = output;

    if (account.scopes.length === 0) {
      this.permissionRequestDenied = true;

      beaconController.resetConnection();

      return;
    }

    if (BaseApi.getWalletType(account.address)) {
      this.isWalletAlreadyExists = true;

      beaconController.resetConnection();

      return;
    }

    this.isPermissionsGranted = true;

    const substrateAccount = BaseApi.encodeAddress(account.address);
    const ethereumAddress = this.getEthereumAccount(account);
    const meta: KeyringJson$Meta = { name: 'mobile wallet', isMobile: true, ethereumAddress };

    if (IS_EXTENSION) await createAddress(substrateAccount, meta); //extenstion service worker

    BaseApi.saveAddress(substrateAccount, meta);

    await this.setSelectedWallet(substrateAccount);
  }

  getEthereumAccount(account: PermissionResponsePayload): string {
    const filteredAccount = account.chainData.accounts.find((el) => {
      if (el.network.genesisHash === MOONBEAM_GENESISHASH) return el;
    });

    return filteredAccount?.address ?? '';
  }
}
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}

.error__container {
  display: flex;
  flex-flow: column;
  height: 100%;
  justify-content: space-between;
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
