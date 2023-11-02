<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="close">
    <template v-if="isQRPrep">
      <h2 class="header">{{ $t('mobileConnector.qrHeader') }}</h2>

      <QR :payload="qr" />
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
import { Action } from 'vuex-class';
import type { AsyncFn } from '@/interfaces';
import { walletConnectDappInitSession } from '@/extension/messaging';
import { ActionTypes as AccountActionTypes } from '@/store/accounts/actions';
import PermissionRequestPopup from '@/screens/mobileConnect/PermissionRequestPopup.vue';

@Component({
  components: {
    PermissionRequestPopup,
  },
})
export default class MobileConnect extends Vue {
  requestInfo: null = null;
  requestResponse: null = null;
  isLoading = false;
  isRequest = false;
  isPaired = false;
  isPermissionsGranted = false;
  isWalletAlreadyExists = false;
  isActiveAccountExists = false;
  isPossibleConnectionProblem = false;
  permissionRequestDenied = false;
  qr: string | null = null;
  @Action(AccountActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: AsyncFn<string>;

  async mounted() {
    const res = await walletConnectDappInitSession((data) => {
      if (data) this.qr = data;
      else this.qr = null;
    });
    if (res) this.qr = res;
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
    return !this.connectionStatus && this.qr && !this.isLoading;
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
