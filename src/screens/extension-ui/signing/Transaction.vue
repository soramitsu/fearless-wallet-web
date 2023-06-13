<template>
  <AboveForm :fullScreen="true" header="assets.transaction" :closeHandler="onReject">
    <div v-if="isMobileSignRequired" class="transaction-mobile">
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

    <div v-else class="transaction-content">
      <div>
        <WalletInfo class="wallet-info" :name="accountName" :address="address" />

        <InfoList>
          <InfoItem v-for="(value, key) in txInfo" :name="key" :value="value" :key="key" />
        </InfoList>

        <ConfirmationPasswordPopup
          v-if="isSignPopupVisible"
          sizeWidth="medium"
          :address="payload.address"
          :transactionId="request.id"
          :firstIcon="f"
          :payload="payload"
          @close="onClose"
        />
      </div>

      <Button size="big" class="button" text="assets.signTransaction" @click="onSign" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { AccountJson, SigningRequest } from '@/extension/background/extension-base/src/background/types/types';
import BaseApi from '@/util/BaseApi';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { AsyncFn, SignerPayloadJSON, PayloadJSON } from '@/interfaces';
import { beaconController, ExtensionController } from '@/controllers';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import registry from '@/extension/background/extension-base/src/api/substrate/typeRegistry';

@Component({
  components: {
    WalletInfo,
    ConfirmationPasswordPopup,
    InfoItem,
    InfoList,
    Checkbox,
  },
})
export default class Auth extends Vue {
  isLocked = false;
  isSignPopupVisible = false;

  @Getter(ExtensionGettersTypes.signRequestPayload) payload!: SignerPayloadJSON;
  @Getter(ExtensionGettersTypes.signList) requests!: SigningRequest[];
  @Action(ExtensionActionTypes.SIGN_CANCEL) onSignCancel!: AsyncFn<string>;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  get request() {
    return this.requests[0];
  }

  get address() {
    return this.request.account.address;
  }

  get accountName() {
    return this.request.account.name;
  }

  get txInfo() {
    return {
      url: this.request.url,
      nonce: this.nonce,
      genesisHash: this.genesisHash,
      specVersion: this.specVersion,
      method: this.method,
      mortality: this.mortality,
    };
  }

  get typedPayload() {
    registry.setSignedExtensions(this.payload.signedExtensions);

    return registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });
  }

  get isMobileSignRequired() {
    if (!this.payload.address) return false;

    const substrateAddress = BaseApi.encodeAddress(this.payload.address, 42);

    return this.accounts.some((account) => account.address === substrateAddress && account.isMobile);
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

  get mortality(): string {
    return this.mortalityAsString(this.typedPayload.era, this.payload.blockNumber);
  }

  async mounted() {
    if (this.isMobileSignRequired) {
      const payload: PayloadJSON = this.payload;
      delete payload.address;
      payload.type = 'json';

      const response = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

      if (!response || !response.blockchainData.signature) ExtensionController.cancelSign(this.request.id);

      ExtensionController.approveSignSignature(this.request.id, response.blockchainData.signature);

      this.$router.push(Components.Main);
    }
  }

  @Watch('requests')
  updateRoute(value: SigningRequest[]) {
    if (value.length === 0) this.$router.push({ name: Components.Wallet });
  }

  mortalityAsString(era: ExtrinsicEra, hexBlockNumber: string): string {
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
    this.onSignCancel(this.request.id);
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

.transaction-mobile {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-flow: column;
}
</style>
