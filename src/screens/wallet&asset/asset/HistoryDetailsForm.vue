<template>
  <AboveForm header="Details" :fullScreen="true" @closeHandler="handleClose">
    <div class="details">
      <Scroll>
        <div class="descriptions">
          <div v-if="!isSora && !!extrinsicHash" class="item" data-testid="extrinsicHashLabel">
            Extrinsic Hash

            <div class="item-value item-icon" data-testid="extrinsicHash">
              {{ displayExtrinsicHash }}

              <Icon icon="copy" className="copy" data-testid="copyBtn" @click="copy(extrinsicHash)" />
            </div>
          </div>

          <div v-if="!!blockHash" class="item" data-testid="extrinsicHashLabel">
            Block Hash

            <div class="item-value item-icon" data-testid="extrinsicHash">
              {{ displayBlockHash }}

              <Icon icon="copy" className="copy" data-testid="copyBtn" @click="copy(blockHash)" />
            </div>
          </div>

          <template v-if="isTransfer">
            <div class="item">
              From

              <div class="item-value item-icon">
                <Identicon v-if="!isTon" :address="fromAddress" />

                {{ displayFromAddress }}

                <Icon icon="copy" className="copy" @click="copy(fromAddress)" />
              </div>
            </div>

            <div class="item">
              To

              <div class="item-value item-icon">
                <Identicon v-if="!isTon" :address="toAddress" />

                {{ displayToAddress }}

                <Icon icon="copy" className="copy" @click="copy(toAddress)" />
              </div>
            </div>
          </template>

          <div v-if="isReward" class="item">
            Validator

            <div class="item-value item-icon">
              <Identicon :address="validator" />

              {{ displayValidator }}

              <Icon icon="copy" className="copy" @click="copy(validator)" />
            </div>
          </div>

          <div class="item" data-testid="statusLabel">
            Status

            <div :class="statusClasses" data-testid="statusValue">{{ statusText }}</div>
          </div>

          <div class="item" data-testid="dateLabel">
            Date

            <div class="item-value" data-testid="dateValue">{{ date }}</div>
          </div>

          <div v-if="isReward" class="item" data-testid="eraLabel">
            Era

            <div class="item-value" data-testid="eraValue">{{ era }}</div>
          </div>

          <div v-if="!!moduleType" class="item" data-testid="moduleLabel">
            Module

            <div class="item-value" data-testid="moduleValue">{{ moduleType }}</div>
          </div>

          <div v-if="!!method" class="item" data-testid="methodLabel">
            Method

            <div class="item-value" data-testid="methodValue">{{ method }}</div>
          </div>

          <div v-if="showAmount" class="item" data-testid="amountLabel">
            Amount

            <div class="item-value" data-testid="amountValue">{{ value }}</div>
          </div>

          <div v-if="showTargetAmount" class="item" data-testid="amountLabel">
            Target Amount

            <div class="item-value" data-testid="amountValue">{{ targetValue }}</div>
          </div>

          <div v-if="showFee" class="item" data-testid="feeLabel">
            Transfer fee

            <div class="item-value" data-testid="feeValue">{{ transferFee }}</div>
          </div>
        </div>
      </Scroll>

      <FButton v-if="haveExplorers" size="big" :text="buttonText" @click="openExplorer" />
    </div>

    <Tooltip text="common.copied" target=".copy" placement="bottom" trigger="click" />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { type HistoryElement, type TonEvent, type SoraHistoryElement, TransactionType } from '@/interfaces';
import { getType, getSignTransfer, getHistoryValue, getHumanTransferFee } from '@/helpers/history';
import { cut, getFormattedDate, setClipboard } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  assetId: string;
  historyType: string;
  historyElement: HistoryElement;
}>();

const emit = defineEmits<{
  handlerClose: [];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();
const { t, n } = useI18n();

const selectedNetwork = computed(() => {
  const networkParam = route.params.network ?? route.params.selectedNetwork ?? '';

  return Array.isArray(networkParam) ? networkParam[0] : networkParam;
});

const historyElementSoraType = computed(() => props.historyElement as unknown as SoraHistoryElement);
const historyElementTonType = computed(() => props.historyElement as unknown as TonEvent);

const isSora = computed(() => type.value === 'sora');
const isTon = computed(() => type.value === TransactionType.ton);

const networkProps = computed(() => networksStore.getNetwork(selectedNetwork.value));

const address = computed(() => {
  if (BaseApi.isEthereumNetwork(selectedNetwork.value)) return accountsStore.selectedWallet.ethereumAddress;

  return BaseApi.encodeAddress(accountsStore.selectedWallet.address, networkProps.value.addressPrefix);
});

const selectedNetworkJson = computed(() =>
  networksStore.networks.find((network) => network.name.toLowerCase() === selectedNetwork.value.toLowerCase())
);

const explorerType = computed(() => selectedNetworkJson.value?.externalApi?.explorers?.[0]?.type);

const explorerUrl = computed(() => networkProps.value?.externalApi?.explorers?.[0].url ?? '');

const haveExplorers = computed(() => explorerUrl.value !== '');

const buttonText = computed(() => {
  const typeKey =
    explorerType.value === 'etherscan'
      ? 'accounts.etherscan'
      : explorerType.value === 'tonviewer'
        ? 'accounts.tonviewer'
        : 'accounts.subscan';

  return t(typeKey);
});

const signTransfer = computed(() => getSignTransfer(props.historyElement, address.value, selectedNetwork.value));

const isTransfer = computed(() => type.value === 'transfer' || isTon.value);
const isReward = computed(() => type.value === 'reward');

const showFee = computed(() => {
  if (isSora.value) return historyElementSoraType.value.method !== 'rewarded';

  if (isTon.value) return signTransfer.value === '-';

  return isTransfer.value && signTransfer.value === '-';
});

const showAmount = computed(() => {
  if (isSora.value || isTon.value) return true;

  return isTransfer.value;
});

const showTargetAmount = computed(() => isSora.value && historyElementSoraType.value.method === 'swap');

const statusIsSuccess = computed(() => {
  if (isSora.value) return historyElementSoraType.value.execution.success;

  const { success } = props.historyElement;

  return success ?? true;
});

const statusClasses = computed(() => ['item-value', statusIsSuccess.value ? 'status-success' : 'status-reject']);
const statusText = computed(() => (statusIsSuccess.value ? 'Completed' : 'Reject'));

const validator = computed(() => props.historyElement.reward?.validator);
const displayValidator = computed(() => (validator.value ? cut(validator.value, 10) : 'no validator info'));

const era = computed(() => props.historyElement.reward?.era);

const fromAddress = computed(() =>
  isTon.value ? historyElementTonType.value?.from : props.historyElement.transfer?.from
);
const displayFromAddress = computed(() => cut(fromAddress.value, 10));

const toAddress = computed(() => (isTon.value ? historyElementTonType.value?.to : props.historyElement.transfer?.to));
const displayToAddress = computed(() => cut(toAddress.value, 10));

const moduleType = computed(() => (isSora.value ? historyElementSoraType.value.module : props.historyElement.module));

const method = computed(() => {
  if (isSora.value) return historyElementSoraType.value.method;

  if (isTon.value) return historyElementTonType.value.method;

  return props.historyElement.method;
});

const transferFee = computed(() => {
  const fees = getHumanTransferFee(props.historyElement, selectedNetwork.value);

  return n(fees, 'decimalPrecise');
});

const date = computed(() => getFormattedDate(props.historyElement.timestamp));

const value = computed(() => {
  const result = getHistoryValue(props.historyElement, props.assetId, selectedNetwork.value, address.value);

  if (!result) return '';

  return `${result.signTransfer}${n(result.value, 'decimalPrecise')}`;
});

const targetValue = computed(() => {
  const result = getHistoryValue(props.historyElement, props.assetId, selectedNetwork.value, address.value);

  const target = result?.targetValue;

  return target !== undefined ? n(target, 'decimalPrecise') : '';
});

const type = computed(() => getType(props.historyElement, selectedNetwork.value));

const extrinsicHash = computed(() => props.historyElement.extrinsicHash);
const displayExtrinsicHash = computed(() => cut(extrinsicHash.value));

const blockHash = computed(() => props.historyElement.blockHash);
const displayBlockHash = computed(() => cut(blockHash.value));

function copy(value?: string) {
  if (!value) return;

  setClipboard(value);
}

function openExplorer() {
  if (explorerType.value === 'etherscan' || explorerType.value === 'oklink') {
    if (explorerUrl.value) {
      const url = explorerUrl.value.replace('{type}', 'tx').replace('{value}', props.historyElement.blockHash ?? '');

      window.open(url);
    }

    return;
  }

  if (explorerType.value === 'tonviewer') {
    if (explorerUrl.value) {
      const url = explorerUrl.value
        .replace('{type}', 'transaction')
        .replace('{value}', historyElementTonType.value?.eventId ?? '');

      window.open(url);
    }

    return;
  }

  const url = explorerUrl.value
    .replace('{type}', 'extrinsic')
    .replace('{value}', props.historyElement.extrinsicHash ?? '');

  window.open(url);
}

function handleClose() {
  emit('handlerClose');
}
</script>

<style lang="scss" scoped>
.details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .descriptions {
    padding: 0 $default-padding;

    .item {
      color: $default-white;
      border-bottom: $default-border;
      padding: $default-padding 0;
      display: flex;
      justify-content: space-between;
      height: 55px;

      .item-value {
        font-weight: 600;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .item-icon {
        flex-direction: row;

        .copy {
          margin-left: 10px;
          filter: invert(0.35);
          width: 20px;
          height: 20px;

          &:hover {
            cursor: pointer;
            filter: invert(0.25);
          }
        }
      }

      .status-success {
        color: $success-color;
      }

      .status-reject {
        color: $reject-color;
      }

      .identicon {
        margin-right: 10px;
      }
    }
  }
}
</style>
