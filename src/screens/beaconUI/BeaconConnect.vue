<template>
  <Fragment>
    <Button
      class="import-button"
      width="100%"
      text="Connect with Beacon"
      size="big"
      fontSize="big"
      type="secondary"
      :border="false"
      @click="connectBeacon"
    />

    <AboveForm v-if="isQRshown" :closeHandler="close">
      <img :src="qrPayload" />
    </AboveForm>
  </Fragment>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Fragment } from 'vue-fragment';
import QRCode from 'qrcode';
import { encodeAddress } from '@polkadot/util-crypto';
import { accountController } from '../../controllers/accountController';
import { PermissionSuccess } from '@/interfaces/beacon';
import Button from '@/components/Button.vue';
import { GettersTypes as AccountGetterTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountMutationTypes } from '@/store/accounts/mutations';
import { fearlessConnector } from '@/controllers/beaconController';
import AboveForm from '@/components/AboveForm.vue';

@Component({
  components: {
    Fragment,
    AboveForm,
    Button,
  },
})
export default class BeaconConnect extends Vue {
  isQRshown = false;
  qrPayload = '';

  close() {
    this.isQRshown = false;
  }

  connectBeacon() {
    if (this.qrPayload.length) this.isQRshown = true;
    else fearlessConnector.connect();
  }

  mounted() {
    fearlessConnector.onPairingRequest(async (payload) => {
      this.qrPayload = await QRCode.toDataURL(payload);
      this.isQRshown = true;
    });

    fearlessConnector.onPermissionsResponse((payload: PermissionSuccess) => {
      this.isQRshown = false;
      const accounts = this.$store.getters[AccountGetterTypes.getAccounts];

      const {
        account: { address },
        walletInfo,
      } = payload;

      const substrateAddress = encodeAddress(address, 42);
      console.log(substrateAddress, accounts, 'on premission response');

      if (accounts && accounts[substrateAddress]) {
        this.$store.commit(AccountMutationTypes.TOGGLE_BEACON_FLAG, substrateAddress);
        console.log(this.$store.getters[AccountGetterTypes.getAccounts]);
      }

      console.info('walletInfo:', walletInfo);
    });
  }
}
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}
</style>
