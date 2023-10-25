<template>
  <Popup :headerType="headerType" sizeWidth="big" :headerText="popupHeader" @handlerClose="close" :zIndex="399">
    <div class="popup-content">
      <template v-if="!transactionState && !isSignMobile">
        <Icon icon="lock-green" className="icon__lock-green" iconColor="success" />

        <div class="text row">{{ $t('assets.passwordTransaction') }}</div>

        <ValidatedInput
          v-if="isLocked"
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

        <FButton
          text="common.continue"
          width="100%"
          size="medium"
          fontSize="big"
          type="primary"
          :disabled="disabledButton"
          :border="false"
          @click="sendExtrinsic"
        />
      </template>

      <SignMobile v-else-if="!transactionState" @onSign="onSignMobile" @onCancel="close" />

      <Loader v-if="isTransactionPending" />

      <template v-else-if="isTransactionFinished">
        <div class="descriptions">
          <ExternalLogo :name="firstIconUrl" :width="30" />

          <template v-if="secondIcon">
            <SIcon name="arrows-arrow-right-24" />

            <ExternalLogo :name="secondIconUrl" :width="30" />
          </template>
        </div>

        <div class="transfer-amount">{{ transferAmountString }}</div>

        <div class="transfer-value">{{ transferValueString }}</div>
      </template>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, Ref } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import type { RequestSentInfo, AsyncFn, SwapOptions } from '@/interfaces';
import type { GetNetwork, GetNetworkGenesisHash, SelectedWallet } from '@/store';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import { isSignLocked, makeSwap, makeTransfer, makeCrossChain, cancelMobileSignRequest } from '@/extension/messaging';
import { beaconController } from '@/controllers';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { IS_EXTENSION } from '@/consts/global';
import {
  RequestTransfer,
  AccountJson,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  RequestCrossChain,
  TokenBalance,
} from '@/extension/background/extension-base/src/background/types/types';

@Component({
  components: { SignMobile },
})
export default class ConfirmationPasswordPopup extends Vue {
  readonly isExtension = IS_EXTENSION;
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  signedPayload: RequestSentInfo | null = null;
  transactionState: 'pending' | 'success' | 'failed' | null = null;
  showUnknownErrorPopup = false;

  @Ref('passInput') readonly passInputComponent!: ValidatedInput;
  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) firstIcon!: string;
  @Prop(String) network!: string;
  @Prop(String) secondIcon!: string;
  @Prop(Object) currency?: TokenBalance;
  @Prop(Object) tx!: RequestCheckTransfer | RequestCheckCrossChain;
  @Prop(Object) swapOptions?: SwapOptions;
  @Prop(String) extrinsicType!: 'transfer' | 'crossChain' | 'swap';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Action(ExtensionActionTypes.SIGN_CANCEL) onSignCancel!: AsyncFn<string>;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getNetworkGenesisHash!: GetNetworkGenesisHash;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get classesInput() {
    return [
      'row',
      'password-input',
      {
        'password-input-margin': !this.isExtension,
      },
    ];
  }

  get firstIconUrl() {
    if (this.extrinsicType === 'transfer' || this.extrinsicType === 'swap')
      return this.balances.find(
        ({ assetId, balances }) => assetId === this.firstIcon || balances.some((el) => el.id === this.firstIcon)
      )?.icon;

    // firstIcon === networkName for crossChain
    return this.getNetwork(this.firstIcon)?.icon ?? '';
  }

  get secondIconUrl() {
    if (this.extrinsicType === 'transfer' || this.extrinsicType === 'swap')
      return this.balances.find(({ assetId }) => assetId === this.secondIcon)?.icon;

    // secondIcon === networkName for crossChain
    return this.getNetwork(this.secondIcon)?.icon ?? '';
  }

  get requestTransfer() {
    return {
      ...(this.tx as RequestCheckTransfer),
      isSavePass: this.isSavePass,
      isMobile: !!this.isSignMobile,
      password: this.password,
    } as RequestTransfer;
  }

  get requestCrossChain(): RequestCrossChain {
    return {
      ...(this.tx as RequestCheckCrossChain),
      isSavePass: this.isSavePass,
      isMobile: !!this.isSignMobile,
      password: this.password,
    };
  }

  get transactionAddress() {
    return this.selectedWallet.address;
  }

  get disabledButton() {
    if (!this.isLocked) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get isSignMobile() {
    const encodedAddress = BaseApi.encodeAddress(this.transactionAddress);

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

  get popupHeader() {
    if (this.transactionState === 'success') return 'assets.transactionDone';

    if (this.transactionState === 'failed') return 'assets.transactionError';

    if (this.isTransactionPending) return 'assets.transactionPending';

    return '';
  }

  get transferAmountString() {
    return `-${this.$n(+this.amount, 'decimal')} ${this.currency?.symbol.toUpperCase()}`;
  }

  get transferValueString() {
    return `$${this.$n(+this.value, 'price')}`;
  }

  get isTransactionNotInit() {
    return this.transactionState === undefined;
  }

  get isTransactionPending() {
    return this.transactionState === 'pending';
  }

  get isTransactionFinished() {
    return this.transactionState === 'success' || this.transactionState === 'failed';
  }

  @Watch('password')
  async resetStatusError() {
    this.isErrorPassword = false;
  }

  async mounted() {
    if (!IS_EXTENSION || this.isSignMobile) return;

    this.passInputComponent.input.focus();
    this.resetTxStatus();

    const { isLocked } = await isSignLocked(this.transactionAddress);

    this.isLocked = isLocked;
    this.isSavePass = !this.isLocked;
  }

  resetTxStatus() {
    this.transactionState = null;
  }

  close() {
    this.$emit('close', !this.isTransactionNotInit);

    if (this.isTransactionPending || this.isTransactionFinished) {
      this.resetTxStatus();
    }
  }

  async onSignMobile() {
    if (this.extrinsicType === 'swap' && this.swapOptions)
      await makeSwap({ ...this.swapOptions, password: this.password });
    else this.makeExtrinsic();
  }

  async makeExtrinsic() {
    const callback = (data: any) => {
      if (data.passwordError) {
        this.isErrorPassword = true;

        return;
      }

      // TODO Выводить юзеру ошибку ???
      // TODO ошибку balanceTooLow по хорошему нужно обработать и показать
      console.info('errors:', data.errors);

      this.transactionState = data.status ? 'success' : 'failed';
    };

    if (this.isSignMobile) {
      const mobileCb = () => {
        this.transactionState = 'pending';
      };

      const onMobileCancel = (id: string) => {
        this.transactionState = 'failed';

        cancelMobileSignRequest(id);
      };

      await beaconController.subscribeRawRequests(mobileCb, onMobileCancel);

      return await makeTransfer(this.requestTransfer, callback);
    }

    if (this.extrinsicType === 'transfer') return await makeTransfer(this.requestTransfer, callback);

    if (this.extrinsicType === 'crossChain') return await makeCrossChain(this.requestCrossChain, callback);
  }

  keypress({ key }: KeyboardEvent) {
    if (key === 'Enter') this.sendExtrinsic();
  }

  async sendExtrinsic() {
    this.transactionState = 'pending';

    if (this.extrinsicType === 'swap' && this.swapOptions) {
      const res = await makeSwap({ ...this.swapOptions, password: this.password, isSavePass: this.isSavePass });

      if (!res?.status) {
        this.isErrorPassword = true;

        this.resetTxStatus();

        return;
      }

      this.transactionState = res.status ? 'success' : 'failed';

      return;
    }

    const results = await this.makeExtrinsic();

    if (!results?.status) {
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
  }

  .password-input-margin {
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
      color: $gray-2-color;
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

  .remember-checkbox {
    width: 100%;
    display: flex;
    align-items: flex-start;
  }
}
</style>
