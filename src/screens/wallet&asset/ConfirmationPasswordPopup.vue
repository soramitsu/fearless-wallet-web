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
          errorDescriptions="common.invalidPassword"
          :class="classesInput"
          :readonly="!isLocked"
          :isError="isErrorPassword"
          :showPassword="true"
          @keypress.native="keypress"
        />

        <div v-if="isExtension" class="remember-checkbox">
          <Checkbox :value="isSavePass" size="medium" :label="$t(min15Label)" @change="onSavePassChange" />
        </div>

        <FButton
          text="common.continue"
          width="100%"
          size="medium"
          fontSize="big"
          type="primary"
          :disabled="disabledButton"
          :border="false"
          data-testid="sendExtrinsicBtn"
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
import { Getter } from 'vuex-class';
import {
  type AccountJson,
  type RequestCheckTransfer,
  type RequestCheckCrossChain,
  type RequestTransfer,
  type RequestCrossChain,
  type TokenBalance,
  type RequestSwap,
  BasicTxErrorCode,
} from '@extension-base/background/types/types';
import { type RequestStaking } from '@extension-base/services/staking-service/types';
import { type NftTx } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import type { SwapOptions, StakingOperation } from '@/interfaces';
import type { GetNetwork, GetNetworkGenesisHash, SelectedWallet } from '@/store';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import { isSignLocked, makeSwap, makeTransfer, makeCrossChain, makeStaking } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { IS_EXTENSION } from '@/consts/global';
import { sendNft } from '@/extension/messaging/nfts';

@Component({
  components: { SignMobile },
})
export default class ConfirmationPasswordPopup extends Vue {
  readonly isExtension = IS_EXTENSION;
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  signedPayload: null = null;
  transactionState: 'pending' | 'success' | 'failed' | null = null;
  showUnknownErrorPopup = false;

  @Ref('passInput') readonly passInputComponent!: ValidatedInput;
  @Prop({ type: String, default: '0' }) amount!: string;
  @Prop({ type: String, default: '0' }) value!: string;
  @Prop({ type: String, default: '0' }) fee!: string;
  @Prop({ type: String, default: '0' }) feeValue!: string;
  @Prop(String) firstIcon!: string;
  @Prop(String) secondIcon!: string;
  @Prop(Object) currency?: TokenBalance;
  @Prop(Object) tx!: RequestCheckTransfer | RequestCheckCrossChain | RequestStaking | SwapOptions | NftTx;
  @Prop(String) extrinsicType!: 'transfer' | 'crossChain' | 'swap' | 'nft' | StakingOperation;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getNetworkGenesisHash!: GetNetworkGenesisHash;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
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
    if (this.extrinsicType === 'crossChain')
      return this.networks.find(({ name }) => name.toLowerCase() === this.firstIcon.toLowerCase())?.icon ?? '';

    return this.balances.find(({ assetId }) => assetId === this.firstIcon)?.icon;
  }

  get secondIconUrl() {
    if (this.extrinsicType === 'crossChain')
      return this.networks.find(({ name }) => name.toLowerCase() === this.secondIcon.toLowerCase())?.icon ?? '';

    return this.balances.find(({ assetId }) => assetId === this.secondIcon)?.icon;
  }

  get request() {
    return {
      ...this.tx,
      isSavePass: this.isSavePass,
      isMobile: this.isSignMobile,
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

  get isSuccess() {
    return this.transactionState === 'success';
  }

  get isFailed() {
    return this.transactionState === 'failed';
  }

  get headerType() {
    if (this.isSuccess) return 'success';

    if (this.isFailed) return 'failed';

    return 'pending';
  }

  get popupHeader() {
    if (this.isSuccess) return 'assets.transactionDone';

    if (this.isFailed) return 'assets.transactionError';

    if (this.isTransactionPending) return 'assets.transactionPending';

    return '';
  }

  get transferAmountString() {
    const sumValue = +this.amount + +this.fee;
    const value = this.isSuccess ? sumValue : +this.fee;

    return `-${this.$n(value, 'decimal')} ${this.currency?.symbol.toUpperCase()}`;
  }

  get transferValueString() {
    const sumValue = +this.value + +this.feeValue;
    const value = this.isSuccess ? sumValue : +this.feeValue;

    return `${this.fiatSymbol}${this.$n(value, 'price')}`;
  }

  get isTransactionInit() {
    return this.transactionState !== null;
  }

  get isTransactionPending() {
    return this.transactionState === 'pending';
  }

  get isTransactionFinished() {
    return this.isSuccess || this.isFailed;
  }

  get isStaking() {
    return (
      this.extrinsicType === 'bond' ||
      this.extrinsicType === 'bondExtra' ||
      this.extrinsicType === 'unbond' ||
      this.extrinsicType === 'rebond' ||
      this.extrinsicType === 'redeem' ||
      this.extrinsicType === 'nominate' ||
      this.extrinsicType === 'setController' ||
      this.extrinsicType === 'setPayee' ||
      this.extrinsicType === 'payoutRewards'
    );
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
    this.$emit('close', this.isTransactionInit);

    if (this.isTransactionPending || this.isTransactionFinished) {
      this.resetTxStatus();
    }
  }

  onSavePassChange(value: boolean) {
    this.isSavePass = value;
  }

  async onSignMobile() {
    if (this.extrinsicType === 'swap')
      await makeSwap({
        ...(this.tx as SwapOptions),
        password: this.password,
        isMobile: true,
        isSavePass: this.isSavePass,
      });
    else this.makeExtrinsic();
  }

  async makeExtrinsic() {
    const callback = (data: any) => {
      // TODO Выводить юзеру ошибку ???
      // TODO ошибку balanceTooLow по хорошему нужно обработать и показать
      console.info('errors:', data.errors ?? []);

      // транзакция может не пройти даже после отправки в блокчейн
      this.transactionState = data.status ? 'success' : 'failed';
    };

    if (this.isSignMobile) {
      return makeTransfer(this.request as RequestTransfer, callback);
    }

    if (this.extrinsicType === 'transfer') return makeTransfer(this.request as RequestTransfer, callback);

    if (this.extrinsicType === 'crossChain') return makeCrossChain(this.request as RequestCrossChain, callback);

    if (this.extrinsicType === 'swap') return makeSwap(this.request as RequestSwap);
    if (this.extrinsicType === 'nft') return sendNft(this.request as NftTx);
    if (this.isStaking)
      return makeStaking({
        type: this.extrinsicType,
        params: this.request as RequestStaking,
      });
  }

  keypress({ key }: KeyboardEvent) {
    if (key === 'Enter') this.sendExtrinsic();
  }

  async sendExtrinsic() {
    this.transactionState = 'pending';

    const results = await this.makeExtrinsic();

    if (results && !results?.status) {
      const isErrorPassword = results?.errors?.some(({ code }) => code === BasicTxErrorCode.INVALID_PASSWORD) ?? false;

      if (isErrorPassword) {
        this.isErrorPassword = true;

        this.resetTxStatus();

        return;
      }
    }

    // функции выполняются через "@sora-substrate/util, для них не работают колбеки с подпиской
    if (this.extrinsicType === 'swap' || this.isStaking) this.transactionState = results?.status ? 'success' : 'failed';
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
