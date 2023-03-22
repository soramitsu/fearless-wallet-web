<template>
  <Popup :headerType="headerType" sizeWidth="big" :headerText="popupHeader" :handlerClose="close" :zIndex="399">
    <div class="popup-content">
      <template v-if="!txStatus && !isSignMobile">
        <Icon icon="lock-green" className="icon__lock-green" iconColor="success" />

        <div class="text row">{{ $t('assets.passwordTransaction') }}</div>

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
          @keydown.native.enter="send"
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

      <SignMobile v-else-if="!txStatus" @onSign="onSignMobile" @onCancel="close" />

      <Loader v-if="isTransactionPending" />

      <template v-else-if="isTransactionFinished">
        <div class="descriptions">
          <ExternalLogo :name="firstNetworkIcon" :width="30" />

          <template v-if="secondNetwork">
            <SIcon name="arrows-arrow-right-24" />

            <ExternalLogo :name="secondNetworkIcon" :width="30" />
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
import type { RequestSentInfo, TAction, SignerPayloadJSON, PayloadJSON } from '@/interfaces';
import type { GetNetworkGenesisHash, SelectedWallet } from '@/store';
import { beaconController } from '@/controllers/beaconController';
import { isSignLocked, makeTransfer } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ExtensionActionTypes, ApprovePayload } from '@/store/extension/actions';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import ExtensionController from '@/controllers/extensionController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import {
  AccountJson,
  RequestCheckTransfer,
  RequestTransfer,
  TokenBalance,
} from '@/extension/background/extension-base/src/background/types';
import { getTransactionAddress } from '@/controllers/transferHelpers';

@Component({
  components: { SignMobile },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  signedPayload: RequestSentInfo | null = null;
  transactionState: 'pending' | 'success' | 'failed' | null = null;
  showUnknownErrorPopup = false;

  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(String) transactionId?: string;
  @Prop(Object) currency?: TokenBalance;
  @Prop({ required: true, type: Object }) tx!: RequestCheckTransfer;
  @Prop(Object) payload?: SignerPayloadJSON;

  @Getter(NetworksGettersTypes.getBalance) currencies!: TokenBalance[];
  @Action(ExtensionActionTypes.APPROVE_SIGN_PASSWORD) onSignApprove!: TAction<ApprovePayload>;
  @Action(ExtensionActionTypes.SIGN_CANCEL) onSignCancel!: TAction<string>;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getNetworkGenesisHash!: GetNetworkGenesisHash;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  get show15MinCheckbox() {
    return BaseApi.isExtension();
  }

  get requestTransfer(): RequestTransfer {
    return {
      ...this.tx,
      password: this.password,
    };
  }

  get firstNetworkIcon() {
    return this.currency?.balances.find((net) => net.name === this.firstNetwork)?.icon;
  }

  get secondNetworkIcon() {
    return this.currency?.balances.find((net) => net.name === this.secondNetwork)?.icon;
  }

  get transactionAddress() {
    return getTransactionAddress(this.selectedWallet, this.firstNetwork) ?? '';
  }

  get disabledButton() {
    if (!this.isLocked) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get isSignMobile() {
    const prepAddress = this.transactionId && this.payload?.address ? this.payload.address : this.transactionAddress;
    const encodedAddress = BaseApi.encodeAddress(prepAddress);

    return this.accounts.some((account) => account.address === encodedAddress && account.isMobile);
  }

  get min15Label() {
    return this.isLocked ? 'assets.15min' : 'assets.15minExtend';
  }

  get headerType() {
    if (this.transactionState === 'success') return 'success';

    if (this.transactionState === 'failed') return 'failed';

    return 'pending';
  }

  get txStatus() {
    return this.transactionState;
  }

  get popupHeader() {
    if (this.txStatus === 'success') return 'assets.transactionDone';

    if (this.txStatus === 'failed') return 'assets.transactionError';

    if (this.isTransactionPending) return 'assets.transactionPending';

    return '';
  }

  get transferAmountString() {
    return `-${this.amount} ${this.currency?.name.toUpperCase()}`;
  }

  get transferValueString() {
    return `$${this.value}`;
  }

  get isTransactionNotInit() {
    return this.txStatus === undefined;
  }

  get isTransactionPending() {
    return this.txStatus === 'pending';
  }

  get isTransactionFinished() {
    return this.txStatus === 'success' || this.txStatus === 'failed';
  }

  @Watch('password')
  async resetStatusError() {
    this.isErrorPassword = false;
  }

  created() {
    this.resetTxStatus();
  }

  async mounted() {
    if (!BaseApi.isExtension() || this.isSignMobile) return;

    // const address = this.transactionId ? this.transactionAddress : this.selectedWallet.address;

    const { isLocked, remainingTime } = await isSignLocked(this.selectedWallet.address);

    this.isLocked = isLocked;
    this.isSavePass = !this.isLocked;

    this.isLocked = remainingTime <= 0;
  }

  resetTxStatus() {
    this.transactionState = null;
  }

  close() {
    if (this.isTransactionPending || this.isTransactionFinished) {
      this.resetTxStatus();
    }

    this.$emit('close', true);
  }

  async onSignMobile() {
    if (!this.transactionId)
      makeTransfer(this.requestTransfer, (data) => {
        if (data.status === true) {
          this.transactionState = 'success';
        } else if (data === false) {
          this.transactionState = 'failed';
        }
      });
    else if (this.payload && this.transactionId) await this.signTransactionJSON(this.transactionId);
  }

  async signTransactionJSON(id: string) {
    const payload: PayloadJSON = this.payload as SignerPayloadJSON;
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
    this.transactionState = 'pending';

    if (this.transactionId) {
      this.onSignApprove({
        id: this.transactionId,
        isSavePass: this.isSavePass,
        password: this.password,
      });

      return;
    }

    const results = await makeTransfer(this.requestTransfer, (data) => {
      this.transactionState = data.status ? 'success' : 'failed';
    });

    if (results.errors?.length) {
      this.isErrorPassword = true;
      this.resetTxStatus();
    }
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
