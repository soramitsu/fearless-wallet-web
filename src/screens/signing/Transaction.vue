<template>
  <AboveForm :fullScreen="true" header="asset.transaction" :closeHandler="onReject">
    <div v-if="isMobileSignRequired" class="transaction__mobile">
      <Loader />

      <Button
        text="common.cancel"
        width="100%"
        size="medium"
        fontSize="big"
        type="secondary"
        :border="false"
        @click="onReject"
      />
    </div>

    <template v-else>
      <div class="transaction-content">
        <div>
          <WalletInfo class="wallet-info" :name="request.account.name" :address="request.account.address" />

          <InfoList>
            <InfoItem name="from" :value="request.url" />
            <InfoItem name="genesis" :value="genesisHash" />
            <InfoItem name="version" :value="specVersion" />
            <InfoItem name="nounce" :value="nonce" />
            <InfoItem name="method Data" :value="method" />
            <InfoItem name="lifetime" :value="morality" />
          </InfoList>

          <ConfirmationPasswordPopup
            v-if="isSignPopupVisible"
            sizeWidth="medium"
            :address="payload.address"
            :transactionId="request.id"
            :payload="payload"
            @close="onClose"
          />
        </div>

        <Button size="big" class="button" text="asset.signTransaction" @click="onSign" />
      </div>
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { SigningRequest } from '@extension-base/background/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { registry } from '@/extension/background/extension-base/src/background/handlers/State';
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
import { GettersTypes as SignGettersTypes } from '@/store/sign/getters';
import { ActionTypes as SignActionsTypes } from '@/store/sign/actions';
import { TAction, SignerPayloadJSON, PayloadJSON } from '@/interfaces';
import Loader from '@/components/Loader.vue';
import { beaconController } from '@/controllers/beaconController';
import { approveSignSignature } from '@/extension/messaging';
import { Components } from '@/router/routes';

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
    Loader,
    Checkbox,
  },
})
export default class Auth extends Vue {
  @Getter(SignGettersTypes.getSignRequestPayload) payload!: SignerPayloadJSON;
  @Getter(SignGettersTypes.getSignRequest) request!: SigningRequest;
  @Action(SignActionsTypes.SIGN_CANCEL) onSignCancel!: TAction<string>;

  isLocked = false;
  isSignPopupVisible = false;
  async mounted() {
    if (this.isMobileSignRequired) {
      const payload: PayloadJSON = this.payload as any;
      delete payload.address;
      payload.type = 'json';

      const { blockchainData } = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

      approveSignSignature(this.request.id, blockchainData.signature);

      this.$router.push(Components.Main);
    }
  }
  get typedPayload() {
    registry.setSignedExtensions(this.payload.signedExtensions);

    return registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });
  }

  get isMobileSignRequired() {
    const substrateAddress = BaseApi.encodeAddress(this.payload.address as string, 42);

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

  onClose() {
    this.isSignPopupVisible = false;
  }

  async onReject() {
    await this.onSignCancel(this.request.id);
  }
}
</script>

<style lang="scss" scoped>
.transaction-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .wallet-info {
    margin-bottom: 14px;
  }
}

.transaction__mobile {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-flow: column;
}
</style>
