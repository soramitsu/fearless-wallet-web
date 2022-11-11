<template>
  <Popup class="sending-popup" :headerType="headerType" sizeWidth="big" :headerText="popupHeader" :handlerClose="close">
    <div class="popup-content">
      <template v-if="!isTransactionInit && !isSignMobile">
        <Icon icon="lock-green" className="icon__lock-green" />

        <div class="text row">{{ $t('asset.passwordTransaction') }}</div>

        <ValidatedInput
          v-if="isLocked"
          v-model="password"
          placeholder="common.password"
          size="big"
          class="input row"
          errorDescriptions="common.invalidPassword"
          :isError="isErrorPassword"
          :showPassword="true"
        />

        <div class="remember__checkbox">
          <Checkbox v-model="isSavePass" size="medium" :label="min15Label" />
        </div>

        <Button
          text="common.continue"
          width="100%"
          size="medium"
          fontSize="big"
          type="primary"
          :disabled="disabledButton"
          :border="false"
          @click="send"
        />
      </template>

      <SignMobile v-else-if="!isTransactionInit" @onSign="signMobile" @onCancel="close" />

      <Loader v-if="isTransactionPending" />

      <template v-else-if="isTransactionFinished">
        <div class="descriptions">
          <NetworkLogo :name="firstNetwork" :width="30" />

          <template v-if="secondNetwork">
            <SIcon name="arrows-arrow-right-24" />

            <NetworkLogo :name="secondNetwork" :width="30" />
          </template>
        </div>

        <div class="transfer-amount">{{ transferAmountString }}</div>

        <div class="transfer-value">{{ transferValueString }}</div>
      </template>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { Currencies, Currency, RequestSentInfo, TAction, SignerPayloadJSON, PayloadJSON } from '@/interfaces';
import { beaconController } from '@/controllers/beaconController';
import { isSignLocked } from '@/extension/messaging';
import { isExtension } from '@/helpers/common';
import Loader from '@/components/Loader.vue';
import Popup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ExtensionActionTypes, ApprovePayload } from '@/store/extension/actions';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { GetNetworkGenesisHash } from '@/store/networks/types';
import ExtensionController from '@/controllers/extensionController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';

@Component({
  components: {
    Popup,
    Button,
    Loader,
    Checkbox,
    NetworkLogo,
    ValidatedInput,
    SignMobile,
  },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  signedPayload: RequestSentInfo | null = null;
  transactionState: 'pending' | 'success' | 'failed' | undefined = undefined;

  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(String) transactionId?: string;
  @Prop(Object) currency?: Currency;
  @Prop(Object) payload?: SignerPayloadJSON;

  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Action(ExtensionActionTypes.APPROVE_SIGN_PASSWORD) onSignApprove!: TAction<ApprovePayload>;
  @Action(ExtensionActionTypes.SIGN_CANCEL) onSignCancel!: TAction<string>;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getNetworkGenesisHash!: GetNetworkGenesisHash;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get transactionAddress() {
    return this.currency?.getTransactionAddress(this.selectedWallet, this.firstNetwork) ?? '';
  }

  get disabledButton() {
    if (!this.isLocked) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get isSignMobile() {
    return BaseApi.isMobileWallet(this.transactionAddress);
  }

  get transactionStatus() {
    return this.currency?.transactionStatus ?? this.transactionState;
  }

  get min15Label() {
    return this.isLocked ? 'asset.15min' : 'asset.15minExtend';
  }

  get headerType() {
    if (this.transactionStatus === 'success') return 'success';

    if (this.transactionStatus === 'failed') return 'failed';

    return 'pending';
  }

  get popupHeader() {
    if (this.transactionStatus === 'success') return 'asset.transactionDone';

    if (this.transactionStatus === 'failed') return 'asset.transactionError';

    if (this.isTransactionPending) return 'asset.transactionPending';

    return '';
  }

  get transferAmountString() {
    return `-${this.amount} ${this.currency?.displayName.toUpperCase()}`;
  }

  get transferValueString() {
    return `$${this.value}`;
  }

  get isTransactionInit() {
    return !!this.transactionStatus;
  }

  get isTransactionPending() {
    if (!this.isTransactionInit) return false;

    return this.transactionStatus === 'pending';
  }

  get isTransactionFinished() {
    if (!this.isTransactionInit) return false;

    return this.transactionStatus !== 'pending';
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  async mounted() {
    if (!isExtension() && this.isSignMobile) return;

    if (this.transactionId !== undefined) {
      const { isLocked } = await isSignLocked(this.transactionId);
      this.isLocked = isLocked;
      this.isSavePass = !this.isLocked;
    }
  }

  close() {
    if (!this.isTransactionInit) {
      this.$emit('close');

      return;
    }

    if (this.transactionId && this.isTransactionPending) {
      ExtensionController.cancelSign(this.transactionId);
      this.transactionState = undefined;

      this.$emit('close', true);

      return;
    }

    if (this.isTransactionFinished) {
      this.currency?.clearSendStatus();
      this.transactionState = undefined;

      this.$emit('close', true);
    }
  }

  async signMobile() {
    if (!this.transactionId && this.currency?.extrinsic) await this.currency?.send(this.transactionAddress, true);
    else if (this.payload && this.transactionId) await this.signTransactionJSON(this.transactionId);
  }

  async signTransactionJSON(id: string) {
    const payload: PayloadJSON = this.payload as any;
    delete payload.address;
    payload.type = 'json';

    const { blockchainData } = await beaconController.sendRequestJSON(payload as unknown as PayloadJSON);

    if (blockchainData.signature.length === 0) {
      this.transactionState = 'failed';

      ExtensionController.cancelSign(id);

      return;
    }

    ExtensionController.approveSignSignature(id, blockchainData.signature);
  }

  async send() {
    if (this.isLocked) {
      this.isErrorPassword = !BaseApi.unlockPair(this.transactionAddress, this.password);

      if (this.isErrorPassword) return;
    }

    if (this.transactionId) {
      await this.onSignApprove({
        id: this.transactionId,
        isSavePass: this.isSavePass,
        password: this.password,
      });
    } else await this.currency?.send(this.transactionAddress);
  }
}
</script>

<style lang="scss" scoped>
.sending-popup {
  z-index: 399;

  .popup-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 25px;
    min-height: 175px;

    .input {
      width: 100%;
    }

    .icon__lock-green {
      width: 30px;
      height: 30px;
    }

    .text {
      font-weight: 700;
      font-size: 18px;
      width: 250px;
    }

    .row {
      margin-top: 15px;
    }

    .descriptions {
      display: flex;
      justify-content: space-between;
      background: $secondary-background-color;
      border-radius: 50px;
      margin-bottom: 20px;
      padding: 12px;

      .s-icon-arrows-arrow-right-24 {
        color: rgba(255, 255, 255, 0.3);
        font-size: 30px !important;
        margin: 0 10px;
      }
    }

    .transfer-amount {
      font-weight: 800;
      font-size: 20px;
      margin-bottom: 10px;
    }

    .transfer-value {
      font-size: 16px;
      color: $gray-color;
    }

    .remember__checkbox {
      width: 100%;
      display: flex;
      align-items: flex-start;
    }
  }
}
</style>
