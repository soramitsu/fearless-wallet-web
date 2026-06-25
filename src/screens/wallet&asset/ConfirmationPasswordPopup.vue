<template>
  <Popup :headerType="headerType" sizeWidth="big" :headerText="popupHeader" @handlerClose="close" :zIndex="399">
    <div class="popup-content">
      <SignMobile v-if="!transactionState" @onSign="onSignMobile" @onCancel="close" />

      <Loader v-if="isTransactionPending" />

      <template v-else-if="isTransactionFinished">
        <template v-if="extrinsicType !== 'nft'">
          <div class="descriptions">
            <ExternalLogo v-if="firstIconUrl" :name="firstIconUrl" :width="30" class="asset-icon" />

            <template v-if="secondIcon">
              <Icon icon="chevron-right" />

              <ExternalLogo :name="secondIconUrl" :width="30" class="asset-icon" />
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
import { defineComponent } from 'vue';


import type { RequestStaking } from '@extension-base/services/staking-service/types';
import type { NftTx } from '@extension-base/services/nft-service/types';
import type {
  RequestCheckCrossChain,
  RequestTransfer,
  RequestCrossChain,
  RequestSwap,
  ResponseNftTransfer,
  BasicTxResponse,
} from '@extension-base/background/types/types';
import type { RequestPool } from '@extension-base/services/pools-service/types';
import type { PoolsOperation } from '@/interfaces/pools';
import { type StakingOperation } from '@/interfaces';
import { makeSwap, makeTransfer, makeCrossChain, makeStaking, makePool } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { IS_EXTENSION } from '@/consts/global';
import { sendNft } from '@/extension/messaging/nfts';
import { isSameString, isSora, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'ConfirmationPasswordPopup',
  components: { SignMobile },
  props: {
    amount: { type: String, default: '0' },
    value: { type: String, default: '0' },
    fee: { type: String, default: '0' },
    feeValue: { type: String, default: '0' },
    firstIcon: String,
    secondIcon: String,
    currency: Object,
    tx: Object,
    extrinsicType: String,
  },
  data() {
    return {
      isExtension: IS_EXTENSION,
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      hash: undefined,
      signedPayload: null,
      transactionState: null,
      showUnknownErrorPopup: false,
    };
  },
  computed: {
    firstIconUrl() {
      if (this.extrinsicType === 'crossChain')
            return this.networksStore.networks.find(({ name }) => isSameString(name, this.firstIcon))?.icon ?? '';

          const tokenGroup = this.accountsStore.balances.find(({ groupId }) => groupId === this.firstIcon);

          if (tokenGroup) return tokenGroup.icon;

          return this.firstIcon;
    },
    secondIconUrl() {
      if (this.extrinsicType === 'crossChain')
            return (
              this.networksStore.networks.find(({ name }) => name.toLowerCase() === this.secondIcon.toLowerCase())?.icon ?? ''
            );

          const tokenGroup = this.accountsStore.balances.find(({ groupId }) => groupId === this.secondIcon);

          if (tokenGroup) return tokenGroup.icon;

          return this.secondIcon;
    },
    request() {
      return {
            ...this.tx,
            isMobile: this.isSignMobile,
          };
    },
    transactionAddress() {
      return this.accountsStore.selectedWallet.address;
    },
    isSignMobile() {
      const encodedAddress = BaseApi.encodeAddress(this.transactionAddress);

          return this.accountsStore.accounts.some((account) => account.address === encodedAddress && account.isMobile);
    },
    isSuccess() {
      return this.transactionState === 'success';
    },
    isFailed() {
      return this.transactionState === 'failed';
    },
    headerType() {
      if (this.isSuccess) return 'success';

          if (this.isFailed) return 'failed';

          return 'pending';
    },
    popupHeader() {
      if (this.isSuccess) return 'assets.transactionDone';

          if (this.isFailed) return 'assets.transactionError';

          if (this.isTransactionPending) return 'assets.transactionPending';

          return '';
    },
    transferAmountString() {
      const sumValue = +this.amount + +this.fee;
          const value = this.isSuccess ? sumValue : +this.fee;

          return `-${this.$n(value, 'decimal')} ${this.currency?.symbol.toUpperCase()}`;
    },
    transferValueString() {
      const sumValue = +this.value + +this.feeValue;
          const value = this.isSuccess ? sumValue : +this.feeValue;

          return `${this.accountsStore.fiatSymbol}${this.$n(value, 'price')}`;
    },
    isTransactionInit() {
      return this.transactionState !== null;
    },
    isTransactionPending() {
      return this.transactionState === 'pending';
    },
    isTransactionFinished() {
      return this.isSuccess || this.isFailed;
    },
    isTon() {
      return this.accountsStore.selectedWallet.isTon;
    },
    isPool() {
      return this.extrinsicType === 'addLiquidity' || this.extrinsicType === 'removeLiquidity';
    },
    isStaking() {
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
    },
  },
  async mounted() {
    this.resetTxStatus();
        this.sendExtrinsic();
  },
  methods: {
    resetTxStatus() {
      this.transactionState = null;
    },
    close() {
      this.$emit('close', this.isTransactionInit);

          if (this.isTransactionPending || this.isTransactionFinished) this.resetTxStatus();
    },
    copyHash() {
      setClipboard(this.hash ?? '');
    },
    async onSignMobile() {
      if (this.extrinsicType === 'swap') await makeSwap(this.request as RequestSwap);
          else this.makeExtrinsic();
    },
    async makeExtrinsic() {
      const callback = (data: BasicTxResponse) => {
            // TODO Выводить юзеру ошибку ???
            // TODO ошибку balanceTooLow по хорошему нужно обработать и показать
            console.info('errors:', data.errors ?? []);

            // транзакция может не пройти даже после отправки в блокчейн
            this.transactionState = data.status ? 'success' : 'failed';
          };

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
    },
    openExplorer() {
      const network = this.networksStore.getNetwork((this.tx as NftTx).network);
          const explorerUrl = network.externalApi?.explorers ? network?.externalApi?.explorers[0].url : '';

          const hostname = new URL(explorerUrl).hostname;

          window.open(`https://${hostname}/tx/${this.hash}`);
    },
    async sendExtrinsic() {
      this.transactionState = 'pending';

          const results = await this.makeExtrinsic();

          if (this.extrinsicType === 'nft') {
            const result = results as ResponseNftTransfer;

            this.hash = result.hash;
          }

          const txCross = this.tx as RequestCheckCrossChain;

          // функции выполняются через "@sora-substrate/util, для них не работают колбеки с подпиской
          // аналогично для TON экосистемы
          if (
            this.isTon ||
            this.isStaking ||
            this.isPool ||
            this.extrinsicType === 'swap' ||
            this.extrinsicType === 'nft' ||
            (this.extrinsicType === 'crossChain' && isSora(txCross.originNet))
          )
            this.transactionState = results?.status ? 'success' : 'failed';
    },
  },
});
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

  .icon__lock-green {
    width: 30px;
    height: 30px;
  }

  .text {
    font-weight: 700;
    font-size: 1.125em;
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
      font-size: 1.875em !important;
      margin: 0 10px;
    }

    .asset-icon {
      border-radius: 50%;
    }
  }

  .transfer-amount {
    font-weight: 800;
    font-size: 1.25rem;
    margin-bottom: 10px;
  }

  .transfer-value {
    font-size: 1em;
    color: $gray-color;
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
    font-size: 1em;
    font-weight: 400;
  }

  .icon-circle {
    background-color: #ffffff08;
    border-radius: 50%;
    padding: 21px;
  }
}
</style>
