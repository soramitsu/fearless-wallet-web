<template>
  <AboveForm :blur="true" header="Transaction" :closeHandler="onReject">
    <WalletInfo class="wallet-info" :name="request.account.name" :address="request.account.address" />

    <InfoList>
      <InfoItem name="from" :value="request.url" />
      <InfoItem name="genesis" :value="genesisHash" />
      <InfoItem name="version" :value="specVersion" />
      <InfoItem name="nounce" :value="nonce" />
      <InfoItem name="method Data" :value="method" />
      <InfoItem name="lifetime" :value="morality" />
    </InfoList>

    <template v-if="isMobileSignRequired">
      <Button size="big" class="button" text="Sign the transaction" @click="onSignMobile" />
    </template>

    <template v-else>
      <ConfirmationPasswordPopup
        v-if="isSignPopupVisible"
        text="Password for this account"
        sizeWidth="medium"
        @close="onClose"
        :address="payload.address"
        :transactionId="request.id"
      />

      <Button size="big" class="button" text="Sign the transaction" @click="onSign" />
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { SigningRequest } from '@extension-base/background/types';
import { encodeAddress } from '@polkadot/util-crypto';
import { registry } from '@extension-base/background/handlers/State';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { fearlessConnector } from '@/controllers/beaconController';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/signing/WalletInfo.vue';
import TransactionContent from '@/layouts/TransactionContent.vue';
import InfoList from '@/layouts/InfoList.vue';
import InfoItem from '@/screens/signing/InfoItem.vue';
import AboveForm from '@/components/AboveForm.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

@Component({
  components: {
    WalletInfo,
    TransactionContent,
    ConfirmationPasswordPopup,
    InfoItem,
    InfoList,
    Input,
    AboveForm,
    Button,
    Checkbox,
  },
})
export default class Auth extends Vue {
  @Getter('getSignRequestPayload') payload!: SignerPayloadJSON;
  @Getter('getSignRequest') request!: SigningRequest;

  isLocked = false;
  isSignPopupVisible = false;

  get typedPayload() {
    registry.setSignedExtensions(this.payload.signedExtensions);

    return registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });
  }

  get isMobileSignRequired() {
    const substrateAddress = encodeAddress(this.payload.address, 42);

    return BaseApi.getAddress(substrateAddress);
  }

  get specVersion() {
    return this.typedPayload.specVersion.toNumber();
  }

  get genesisHash() {
    return this.typedPayload.genesisHash.toString();
  }

  get nonce() {
    return this.typedPayload.nonce.toString();
  }

  get method() {
    return this.typedPayload.method.toString();
  }

  get morality() {
    return this.mortalityAsString(this.typedPayload.era, this.payload.blockNumber);
  }

  mortalityAsString(era: ExtrinsicEra, hexBlockNumber: string) {
    if (era.isImmortalEra) return 'immortal';

    const { birth, death } = BaseApi.mortalityDecode(era, hexBlockNumber);

    return `mortal, valid from ${birth} to ${death}`;
  }

  onSign() {
    this.isSignPopupVisible = true;
  }

  onSignMobile() {
    fearlessConnector.sendRequest(this.payload);
  }

  onClose() {
    this.isSignPopupVisible = false;
  }

  onReject() {
    this.$store.dispatch('SIGN_CANCEL', this.request.id);
  }
}
</script>

<style lang="scss" scoped>
.wallet-info {
  margin-bottom: 14px;
}

.transaction__password {
  margin-bottom: 14px;
}

.transaction__checkbox {
  width: 100%;
  display: flex;
  align-items: flex-start;
}
</style>
