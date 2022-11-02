<template>
  <AboveForm :blur="true" header="Transaction" :closeHandler="onReject">
    <template v-if="isMobileSignRequired">
      <div class="transaction__mobile">
        <Loader />

        <Button
          text="Cancel"
          width="100%"
          size="medium"
          fontSize="big"
          type="secondary"
          :border="false"
          @click="onReject"
        />
      </div>
    </template>

    <template v-else>
      <WalletInfo class="wallet-info" :name="request.account.name" :address="request.account.address" />

      <InfoList>
        <InfoItem name="from" :value="request.url" />
        <InfoItem name="genesis" :value="genesisHash" />
        <InfoItem name="version" :value="specVersion" />
        <InfoItem name="nounce" :value="nonce" />
        <InfoItem name="method Data" :value="method" />
        <InfoItem name="lifetime" :value="morality" />
      </InfoList>

      <template>
        <ConfirmationPasswordPopup
          v-if="isSignPopupVisible"
          sizeWidth="medium"
          :address="payload.address"
          :transactionId="request.id"
          :payload="payload"
          @close="onClose"
        />

        <Button size="big" class="button" text="asset.signTransaction" @click="onSign" />
      </template>
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
import { Components } from '@/router/routes';
import SignController from '@/controllers/signController';

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

      const response = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

      if (!response || !response.blockchainData.signature) SignController.cancelSign(this.request.id);

      SignController.approveSignSignature(this.request.id, response.blockchainData.signature);

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
.wallet-info {
  margin-bottom: 14px;
}

.transaction__password {
  margin-bottom: 14px;
}

.transaction__mobile {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-flow: column;
}

.transaction__checkbox {
  width: 100%;
  display: flex;
  align-items: flex-start;
}
</style>
