<template>
  <Popup :headerType="headerType" sizeWidth="big" :headerText="popupHeader" @handlerClose="close" :zIndex="399">
    <div class="popup-content">
      <template v-if="!transactionState && !isSignMobile">
        <Icon icon="lock-green" className="icon__lock-green" iconColor="success" />

        <div class="text row">{{ $t('assets.passwordTransaction') }}</div>

        <ValidatedInput
          v-if="isLocked"
          ref="passInput"
          :value="password"
          placeholder="common.password"
          size="big"
          errorDescriptions="common.invalidPassword"
          data-testid="passwordInput"
          :class="classesInput"
          :readonly="!isLocked"
          :isError="isErrorPassword"
          :showPassword="true"
          @keypress.native="keypress"
          @change="changePassword"
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
        <template v-if="extrinsicType !== 'nft'">
          <div class="descriptions">
            <ExternalLogo v-if="firstIconUrl" :name="firstIconUrl" :width="30" />

            <template v-if="secondIcon">
              <SIcon name="arrows-arrow-right-24" />

              <ExternalLogo :name="secondIconUrl" :width="30" />
            </template>
          </div>
          <div class="transfer-amount" data-testid="confirmedTransferAmount">{{ transferAmountString }}</div>

          <div class="transfer-value" data-testid="confirmedTransferValue">{{ transferValueString }}</div>
        </template>

        <template v-else>
          <div class="icon-circle">
            <Icon
              :icon="isFailed ? 'close' : 'check'"
              className="icon__lock-green"
              :iconColor="isFailed ? 'error' : 'success'"
              class="icon-check"
            />
          </div>

          <template v-if="isSuccess">
            <span class="nft-success-msg" data-testid="nftSuccessMsg">{{ $t('nft.txSuccessMessage') }}</span>
            <FButton
              text="common.copyHash"
              class="copy-hash"
              iconName="copy"
              iconColor="pink"
              width="100%"
              size="small"
              fontSize="small"
              type="secondary"
              data-testid="copyHashBtn"
              :border="false"
              @click="copyHash"
            />

            <FButton
              text="accounts.etherscan"
              iconName="arrow-link"
              iconColor="pink"
              width="100%"
              size="small"
              fontSize="small"
              type="secondary"
              data-testid="viewInEtherscanBtn"
              :border="false"
              @click="openExplorer"
            />

            <FButton
              text="common.close"
              width="100%"
              size="small"
              fontSize="small"
              type="secondary"
              data-testid="closeBtn"
              :border="false"
              @click="close"
            />

            <Tooltip text="common.copied" target=".copy-hash" placement="top" trigger="click" />
          </template>
        </template>
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
  type TokenGroup,
  type RequestSwap,
  BasicTxErrorCode,
  type BasicTxResponse,
  type ResponseMakeSwap,
  type ResponseNftTransfer,
} from '@extension-base/background/types/types';
import type { RequestStaking } from '@extension-base/services/staking-service/types';
import type { RequestPool } from '@extension-base/services/pools-service/types';
import type { NftTx } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import type { SwapOptions, StakingOperation } from '@/interfaces';
import type { GetNetwork, GetNetworkGenesisHash, SelectedWallet } from '@/store';
import type ValidatedInput from '@/components/ValidatedInput.vue';
import type { PoolsOperation } from '@/interfaces/pools';
import { isSignLocked, makeSwap, makeTransfer, makeCrossChain, makeStaking, makePool } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { IS_EXTENSION } from '@/consts/global';
import { sendNft } from '@/extension/messaging/nfts';
import { isSora } from '@/helpers';

@Component({
  components: { SignMobile },
})
export default class ConfirmationPasswordPopup extends Vue {
  readonly isExtension = IS_EXTENSION;
  password = '';
  isErrorPassword = false;
  isLocked = true;
  isSavePass = false;
  hash: string | undefined = undefined;
  signedPayload: null = null;
  transactionState: 'pending' | 'success' | 'failed' | null = null;
  showUnknownErrorPopup = false;

  @Ref('passInput') readonly passInputComponent!: typeof ValidatedInput;
  @Prop({ type: String, default: '0' }) amount!: string;
  @Prop({ type: String, default: '0' }) value!: string;
  @Prop({ type: String, default: '0' }) fee!: string;
  @Prop({ type: String, default: '0' }) feeValue!: string;
  @Prop(String) firstIcon!: string;
  @Prop(String) secondIcon!: string;
  @Prop(Object) currency?: TokenGroup;
  @Prop(Object) tx!: RequestCheckTransfer | RequestCheckCrossChain | RequestStaking | SwapOptions | NftTx | RequestPool;
  @Prop(String) extrinsicType!: 'transfer' | 'crossChain' | 'swap' | 'nft' | StakingOperation | PoolsOperation;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getNetworkGenesisHash!: GetNetworkGenesisHash;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
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

    const tokenGroup = this.balances.find(({ groupId }) => groupId === this.firstIcon);

    if (tokenGroup) return tokenGroup.icon;

    return this.firstIcon;
  }

  get secondIconUrl() {
    if (this.extrinsicType === 'crossChain')
      return this.networks.find(({ name }) => name.toLowerCase() === this.secondIcon.toLowerCase())?.icon ?? '';

    const tokenGroup = this.balances.find(({ groupId }) => groupId === this.secondIcon);

    if (tokenGroup) return tokenGroup.icon;

    return this.secondIcon;
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

  get isPool() {
    return this.extrinsicType === 'addLiquidity' || this.extrinsicType === 'removeLiquidity';
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

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
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

  copyHash() {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(this.hash ?? '');
    }
  }

  onSavePassChange(value: boolean) {
    this.isSavePass = value;
  }

  changePassword(value: string) {
    this.password = value;
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

  async makeExtrinsic(): Promise<BasicTxResponse | ResponseMakeSwap | ResponseNftTransfer | undefined> {
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
        type: this.extrinsicType as StakingOperation,
        params: this.request as RequestStaking,
      });

    if (this.isPool)
      return makePool({
        type: this.extrinsicType as PoolsOperation,
        params: this.request as RequestPool,
      });
  }

  openExplorer() {
    const network = this.getNetwork((this.tx as NftTx).network);
    const explorerUrl = network.externalApi?.explorers ? network?.externalApi?.explorers[0].url : '';

    const hostname = new URL(explorerUrl).hostname;

    window.open(`https://${hostname}/tx/${this.hash}`);
  }

  keypress({ key }: KeyboardEvent) {
    if (key === 'Enter') this.sendExtrinsic();
  }

  async sendExtrinsic() {
    this.transactionState = 'pending';

    const results = await this.makeExtrinsic();

    if (this.extrinsicType === 'nft') {
      const result = results as ResponseNftTransfer;

      this.hash = result.hash;
    }

    if (results && !results?.status) {
      const isErrorPassword = results?.errors?.some(({ code }) => code === BasicTxErrorCode.INVALID_PASSWORD) ?? false;

      if (isErrorPassword) {
        this.isErrorPassword = true;

        this.resetTxStatus();

        return;
      }
    }

    const txCross = this.tx as RequestCheckCrossChain;

    // функции выполняются через "@sora-substrate/util, для них не работают колбеки с подпиской
    if (
      this.isStaking ||
      this.isPool ||
      this.extrinsicType === 'swap' ||
      this.extrinsicType === 'nft' ||
      (this.extrinsicType === 'crossChain' && isSora(txCross.originNet))
    )
      this.transactionState = results?.status ? 'success' : 'failed';
  }
}
</script>

<style lang="scss" scoped>
.popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  gap: 5px;
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
  .nft-img {
    margin-left: auto;
    margin-right: auto;
    width: 150px;
    height: 150px;
  }
  .nft-finished {
    display: flex;
    flex-flow: column;
    justify-content: space-between;
  }
  .nft-success-msg {
    color: $gray-color;
    font-size: 16px;
    font-weight: 400;
  }
  .icon-circle {
    background-color: #ffffff08;
    border-radius: 50%;
    padding: 21px;
  }
}
</style>
