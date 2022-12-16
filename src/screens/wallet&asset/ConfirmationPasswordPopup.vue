<template>
  <Popup
    :headerType="headerType"
    sizeWidth="big"
    :headerText="popupHeader"
    :showCloseButton="showCloseButton"
    :handlerClose="close"
    :zIndex="399"
  >
    <div class="popup-content">
      <template v-if="isTransactionNotInit && !isSignMobile">
        <Icon icon="lock-green" className="icon__lock-green" iconColor="success" />

        <div class="text row">{{ $t('asset.passwordTransaction') }}</div>

        <ValidatedInput
          v-if="isLocked"
          v-model="password"
          placeholder="common.password"
          size="big"
          class="password-input row"
          errorDescriptions="common.invalidPassword"
          :readonly="!isLocked"
          :isError="isErrorPassword"
          :showPassword="true"
        />

        <div v-if="show15MinCheckbox" class="remember__checkbox">
          <Checkbox v-model="isSavePass" size="medium" :label="$t(min15Label)" />
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

      <SignMobile v-else-if="isTransactionNotInit" @onSign="onSignMobile" @onCancel="close" />

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
import type { GetNetworkGenesisHash, SelectedWallet } from '@/store';
import { beaconController } from '@/controllers/beaconController';
import { isSignLocked, refreshPasswordTimeout } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ExtensionActionTypes, ApprovePayload } from '@/store/extension/actions';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import ExtensionController from '@/controllers/extensionController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: { SignMobile },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  signedPayload: RequestSentInfo | null = null;
  transactionState: 'pending' | 'success' | 'failed' | undefined = undefined;
  showUnknownErrorPopup = false;

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

  get show15MinCheckbox() {
    return BaseApi.isExtension();
  }

  get transactionAddress() {
    return this.currency?.getTransactionAddress(this.selectedWallet, this.firstNetwork) ?? '';
  }

  get disabledButton() {
    if (!this.isLocked) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get isSignMobile() {
    if (this.transactionId && this.payload?.address) return BaseApi.isMobileWallet(this.payload.address);

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

  get showCloseButton() {
    if (this.isSignMobile) {
      return !this.isTransactionPending;
    }

    return true;
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

  get isTransactionNotInit() {
    return this.transactionStatus === undefined;
  }

  get isTransactionPending() {
    if (this.isTransactionNotInit) return false;

    return this.transactionStatus === 'pending';
  }

  get isTransactionFinished() {
    if (this.isTransactionNotInit) return false;

    return this.transactionStatus !== 'pending';
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  async mounted() {
    if (!BaseApi.isExtension() || this.isSignMobile) return;

    if (this.transactionId !== undefined) {
      const { isLocked } = await isSignLocked(this.transactionId);

      this.isLocked = isLocked;
      this.isSavePass = !this.isLocked;
    } else {
      const remainingTime = await refreshPasswordTimeout(this.transactionAddress);

      this.isLocked = remainingTime <= 0;

      if (this.isLocked) BaseApi.lockPair(this.transactionAddress);
      else {
        this.password = '00000';
        this.isSavePass = true;
      }
    }
  }

  close() {
    if (this.isTransactionNotInit) {
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
      this.currency?.setTransactionStatus();
      this.transactionState = undefined;

      this.$emit('close', true);
    }
  }

  async onSignMobile() {
    if (!this.transactionId && this.currency?.extrinsic)
      await this.currency?.send(this.transactionAddress, true, false);
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
      this.isErrorPassword = !BaseApi.unlockPair(
        this.transactionId && this.payload?.address ? this.payload.address : this.transactionAddress,
        this.password
      );

      if (this.isErrorPassword) return;
    }

    if (this.transactionId) {
      await this.onSignApprove({
        id: this.transactionId,
        isSavePass: this.isSavePass,
        password: this.password,
      });

      return;
    }

    await this.currency?.send(this.transactionAddress, false, this.isSavePass);
  }
}
</script>

<style lang="scss" scoped>
.popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 25px;
  min-height: 175px;

  .password-input {
    width: 100%;
    margin-bottom: 15px;
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
</style>
