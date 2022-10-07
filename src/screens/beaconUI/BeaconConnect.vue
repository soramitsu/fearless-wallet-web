<template>
  <Fragment>
    <Button
      class="import-button"
      width="100%"
      text="Connect with Mobile Wallet"
      size="big"
      fontSize="big"
      type="secondary"
      :border="false"
      @click="connectBeacon"
    />

    <AboveForm v-if="isQRshown" :closeHandler="close">
      <span>Scan the QR code using the Fearless mobile app</span>
      <Alert v-if="isError" message="Alert something wrong" />
      <QR v-else :payload="qrPayload" />
    </AboveForm>
  </Fragment>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Fragment } from 'vue-fragment';
import { keyring } from '@polkadot/ui-keyring';
import { KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import { Action } from 'vuex-class';
import { encodeAddress } from '@polkadot/util-crypto';
import BaseApi from '@/util/BaseApi';
import { createAddress } from '@/extension/messaging';
import { TAction } from '@/interfaces/common';
import { SetSelectedWallet } from '@/store/accounts/types';
import Button from '@/components/Button.vue';
import { fearlessConnector } from '@/controllers/beaconController';
import AboveForm from '@/components/AboveForm.vue';
import { Components } from '@/router/routes';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import Alert from '@/components/Alert.vue';
import QR from '@/components/QR.vue';

@Component({
  components: {
    Fragment,
    Alert,
    QR,
    AboveForm,
    Button,
  },
})
export default class BeaconConnect extends Vue {
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  isQRshown = false;
  qrPayload = '';
  isError = false;

  close() {
    this.isQRshown = false;
  }

  connectBeacon() {
    if (this.qrPayload.length) this.isQRshown = true;
    else fearlessConnector.connect();
  }

  mounted() {
    fearlessConnector.onPairingRequest(async (payload) => {
      this.qrPayload = payload;
      this.isQRshown = true;
    });

    fearlessConnector.onPermissionsResponse(async (payload) => {
      const { address } = payload.account;
      const meta: KeyringJson$Meta = {
        name: 'beacon_acc',
      };
      const substrateAccount = encodeAddress(payload.account.address);

      if (BaseApi.getAddressType(substrateAccount)) {
        this.isError = true;

        fearlessConnector.disconnect();
        setTimeout(() => {
          this.isError = false;
        }, 3000);

        return;
      }

      keyring.saveAddress(address, meta, 'address');

      await createAddress(meta, address); //extenstion service worker
      this.setSelectedWallet({ selectedWalletAddress: address });

      this.isQRshown = false;
      this.$router.push({ name: Components.Wallet });
    });
  }
}
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}
</style>
