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
import { keyring } from '@polkadot/ui-keyring';
import Button from '@/components/Button.vue';
import { fearlessConnector } from '@/controllers/beaconController';
import AboveForm from '@/components/AboveForm.vue';
import { Components } from '@/router/routes';

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

    fearlessConnector.onPermissionsResponse((payload) => {
      const { address } = payload.account;

      keyring.saveAddress(
        address,
        {
          name: 'active_beacon_account',
        },
        'address'
      );
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
