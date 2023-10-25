<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <div v-if="isMobileSignRequired" class="transaction-mobile">
      <Loader />

      <FButton
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

        <template v-if="!isSignMobile">
          <ValidatedInput
            ref="passInput"
            v-model="password"
            placeholder="common.password"
            size="big"
            :class="classesInput"
            errorDescriptions="common.invalidPassword"
            :readonly="!isLocked"
            :isError="isErrorPassword"
            :showPassword="true"
            @keypress.native="keypress"
          />

          <div v-if="isExtension" class="remember-checkbox">
            <Checkbox v-model="isSavePass" size="medium" :label="$t(min15Label)" />
          </div>
        </template>
      </div>

      <FButton v-if="!isSignMobile" size="big" class="button" text="assets.signTransaction" @click="sendExtrinsic" />

      <SignMobile v-else @onSign="onSignMobile" @onCancel="closeSignMobile" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch, Ref } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import registry from '@extension-base/api/substrate/typeRegistry';
import type { AccountJson, SigningRequest } from '@extension-base/background/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import BaseApi from '@/util/BaseApi';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes, ApprovePayload } from '@/store/extension/actions';
import { AsyncFn, SignerPayloadJSON, PayloadJSON } from '@/interfaces';
import { beaconController, ExtensionController } from '@/controllers';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { IS_EXTENSION } from '@/consts/global';
import { isSignLocked, validatePassword } from '@/extension/messaging';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';

@Component({
  components: {
    WalletInfo,
    InfoItem,
    InfoList,
    Checkbox,
    SignMobile,
  },
})
export default class Transaction extends Vue {
  readonly isExtension = IS_EXTENSION;
  isLocked = true;
  isSignPopupVisible = false;
  isErrorPassword = false;
  password = '';
  isSavePass = false;

  @Ref('passInput') readonly passInputComponent!: ValidatedInput;
  @Getter(ExtensionGettersTypes.signRequestPayload) payload!: SignerPayloadJSON;
  @Getter(ExtensionGettersTypes.signList) requests!: SigningRequest[];
  @Action(ExtensionActionTypes.SIGN_CANCEL) onSignCancel!: AsyncFn<string>;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Action(ExtensionActionTypes.APPROVE_SIGN_PASSWORD) onSignApprove!: AsyncFn<ApprovePayload>;

  get classesInput() {
    return [
      'row',
      'password-input',
      {
        'password-input-margin': !this.isExtension,
      },
    ];
  }

  get transactionId() {
    return this.request.id;
  }

  get disabledButton() {
    if (!this.isLocked) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get transactionAddress() {
    return this.payload?.address ?? this.selectedWallet.address;
  }

  get request() {
    return this.requests[0];
  }

  get isSignMobile() {
    const encodedAddress = BaseApi.encodeAddress(this.transactionAddress);

    return this.accounts.some((account) => account.address === encodedAddress && account.isMobile);
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

  get min15Label() {
    return this.isLocked ? 'assets.15min' : 'assets.15minExtend';
  }

  async mounted() {
    if (this.isMobileSignRequired) {
      const payload: PayloadJSON = this.payload;
      delete payload.address;
      payload.type = 'json';

      const response = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

      if (!response || !response.blockchainData.signature) ExtensionController.cancelSign(this.request.id);

      ExtensionController.approveSignSignature(this.request.id, response.blockchainData.signature);

      this.$router.push({ name: Components.Wallet });
    }

    if (!IS_EXTENSION || this.isSignMobile) return;

    this.passInputComponent.input.focus();

    const { isLocked } = await isSignLocked(this.transactionAddress);

    this.isLocked = isLocked;
    this.isSavePass = !this.isLocked;

    if (!isLocked) this.password = '000000';
  }

  @Watch('password')
  async resetStatusError() {
    this.isErrorPassword = false;
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

  onClose() {
    this.isSignPopupVisible = false;
  }

  async onReject() {
    this.onSignCancel(this.request.id);
  }

  async onSignMobile() {
    this.signTransactionJSON(this.transactionId);
  }

  async closeSignMobile() {
    // TODO
  }

  keypress({ key }: KeyboardEvent) {
    if (key === 'Enter') this.sendExtrinsic();
  }

  async signTransactionJSON(id: string) {
    const payload: PayloadJSON = this.payload as SignerPayloadJSON;
    delete payload.address;
    payload.type = 'json';

    const { blockchainData } = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

    if (blockchainData.signature.length === 0) {
      ExtensionController.cancelSign(id);

      return;
    }

    ExtensionController.approveSignSignature(id, blockchainData.signature);
  }

  async sendExtrinsic() {
    const isValidPass = await validatePassword(this.address, this.password);

    if (!isValidPass) {
      this.isErrorPassword = true;

      return;
    }

    this.onSignApprove({
      id: this.transactionId,
      isSavePass: this.isSavePass,
      password: this.password,
    });
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

.remember-checkbox {
  width: 100%;
  display: flex;
  align-items: flex-start;
}

.row {
  margin-top: 15px;
}

.password-input {
  width: 100%;
}

.password-input-margin {
  margin-bottom: 15px;
}
</style>
