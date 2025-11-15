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
              <SIcon name="arrows-arrow-right-24" />

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

        <p v-if="isFailed && transactionError" class="transaction-error-message" data-testid="transactionErrorMessage">
          {{ transactionError }}
        </p>
      </template>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RequestStaking } from '@extension-base/services/staking-service/types';
import type { NftTx } from '@extension-base/services/nft-service/types';
import type {
  RequestCheckTransfer,
  RequestCheckCrossChain,
  RequestTransfer,
  RequestCrossChain,
  TokenGroup,
  RequestSwap,
  BasicTxResponse,
  ResponseMakeSwap,
  ResponseNftTransfer,
} from '@extension-base/background/types/types';
import type { RequestPool } from '@extension-base/services/pools-service/types';
import type { PoolsOperation } from '@/interfaces/pools';
import { type SwapOptions, type StakingOperation } from '@/interfaces';
import { makeSwap, makeTransfer, makeCrossChain, makeStaking, makePool } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';
import { sendNft } from '@/extension/messaging/nfts';
import { isSameString, isSora, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  amount: string;
  value: string;
  fee: string;
  feeValue: string;
  firstIcon: string;
  secondIcon: string;
  currency?: TokenGroup;
  tx: RequestCheckTransfer | RequestCheckCrossChain | RequestStaking | SwapOptions | NftTx | RequestPool;
  extrinsicType: 'transfer' | 'crossChain' | 'swap' | 'nft' | StakingOperation | PoolsOperation;
}>();

const emit = defineEmits<{
  close: [isTransactionInit: boolean];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const hash = ref<string | undefined>(undefined);
const transactionState = ref<'pending' | 'success' | 'failed' | null>(null);
const transactionError = ref<string | null>(null);

const transactionAddress = computed(() => accountsStore.selectedWallet.address);

const isSignMobile = computed(() => {
  const encodedAddress = BaseApi.encodeAddress(transactionAddress.value);

  return accountsStore.accounts.some((account) => account.address === encodedAddress && account.isMobile);
});

const request = computed(() => ({
  ...props.tx,
  isMobile: isSignMobile.value,
}));

const firstIconUrl = computed(() => {
  if (props.extrinsicType === 'crossChain')
    return networksStore.networks.find(({ name }) => isSameString(name, props.firstIcon))?.icon ?? '';

  const tokenGroup = accountsStore.balances.find(({ groupId }) => groupId === props.firstIcon);

  if (tokenGroup) return tokenGroup.icon;

  return props.firstIcon;
});

const secondIconUrl = computed(() => {
  if (props.extrinsicType === 'crossChain')
    return networksStore.networks.find(({ name }) => name.toLowerCase() === props.secondIcon.toLowerCase())?.icon ?? '';

  const tokenGroup = accountsStore.balances.find(({ groupId }) => groupId === props.secondIcon);

  if (tokenGroup) return tokenGroup.icon;

  return props.secondIcon;
});

const isSuccess = computed(() => transactionState.value === 'success');
const isFailed = computed(() => transactionState.value === 'failed');

const headerType = computed(() => {
  if (isSuccess.value) return 'success';
  if (isFailed.value) return 'failed';

  return 'pending';
});

const popupHeader = computed(() => {
  if (isSuccess.value) return 'assets.transactionDone';
  if (isFailed.value) return 'assets.transactionError';
  if (isTransactionPending.value) return 'assets.transactionPending';

  return '';
});

const transferAmountString = computed(() => {
  const sumValue = +props.amount + +props.fee;
  const value = isSuccess.value ? sumValue : +props.fee;

  const symbol = props.currency?.symbol?.toUpperCase() ?? '';

  return `-${n(value, 'decimal')} ${symbol}`;
});

const transferValueString = computed(() => {
  const sumValue = +props.value + +props.feeValue;
  const value = isSuccess.value ? sumValue : +props.feeValue;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});

const isTransactionInit = computed(() => transactionState.value !== null);
const isTransactionPending = computed(() => transactionState.value === 'pending');
const isTransactionFinished = computed(() => isSuccess.value || isFailed.value);

const isTon = computed(() => accountsStore.selectedWallet.isTon);
const isPool = computed(() => props.extrinsicType === 'addLiquidity' || props.extrinsicType === 'removeLiquidity');
const isStaking = computed(() =>
  [
    'bond',
    'bondExtra',
    'unbond',
    'rebond',
    'redeem',
    'nominate',
    'setController',
    'setPayee',
    'payoutRewards',
  ].includes(props.extrinsicType)
);

function resetTxStatus() {
  transactionState.value = null;
  transactionError.value = null;
}

function close() {
  emit('close', isTransactionInit.value);

  if (isTransactionPending.value || isTransactionFinished.value) resetTxStatus();
}

function copyHash() {
  setClipboard(hash.value ?? '');
}

async function onSignMobile() {
  if (props.extrinsicType === 'swap') await makeSwap(request.value as RequestSwap);
  else await makeExtrinsic();
}

async function makeExtrinsic(): Promise<BasicTxResponse | ResponseMakeSwap | ResponseNftTransfer | undefined> {
  const callback = (data: BasicTxResponse) => {
    console.info('errors:', data.errors ?? []);
    transactionState.value = data.status ? 'success' : 'failed';

    if (!data.status) {
      transactionError.value = data.errors?.[0]?.message ?? null;
    } else {
      transactionError.value = null;
    }
  };

  if (props.extrinsicType === 'transfer') return makeTransfer(request.value as RequestTransfer, callback);

  if (props.extrinsicType === 'crossChain') return makeCrossChain(request.value as RequestCrossChain, callback);

  if (props.extrinsicType === 'swap') return makeSwap(request.value as RequestSwap);

  if (props.extrinsicType === 'nft') return sendNft(request.value as NftTx);

  if (isStaking.value)
    return makeStaking({
      type: props.extrinsicType as StakingOperation,
      params: request.value as RequestStaking,
    });

  if (isPool.value)
    return makePool({
      type: props.extrinsicType as PoolsOperation,
      params: request.value as RequestPool,
    });
}

function openExplorer() {
  const network = networksStore.getNetwork((props.tx as NftTx).network);
  const explorerUrl = network.externalApi?.explorers ? network?.externalApi?.explorers[0].url : '';

  const hostname = new URL(explorerUrl).hostname;

  window.open(`https://${hostname}/tx/${hash.value}`);
}

async function sendExtrinsic() {
  transactionState.value = 'pending';

  const results = await makeExtrinsic();

  if (props.extrinsicType === 'nft') {
    const result = results as ResponseNftTransfer | undefined;
    hash.value = result?.hash;
  }

  const txCross = props.tx as RequestCheckCrossChain;

  if (
    isTon.value ||
    isStaking.value ||
    isPool.value ||
    props.extrinsicType === 'swap' ||
    props.extrinsicType === 'nft' ||
    (props.extrinsicType === 'crossChain' && isSora(txCross.originNet))
  ) {
    if (transactionState.value === 'pending') {
      transactionState.value = results?.status ? 'success' : 'failed';

      if (!results?.status) {
        transactionError.value = results?.errors?.[0]?.message ?? transactionError.value;
      }
    }
  }
}

onMounted(() => {
  resetTxStatus();
  void sendExtrinsic();
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

  .transaction-error-message {
    margin-top: 12px;
    text-align: center;
    color: $simple-orange-color;
    font-size: 0.875rem;
    line-height: 150%;
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
