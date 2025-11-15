<template>
  <TransferForm
    extrinsicType="transfer"
    header="assets.sendFunds"
    :assetId="assetId"
    :selectedNetwork="selectedNetwork"
    :amount="amount"
    :value="value"
    :partialFee="partialFee"
    :recipient="recipient"
    @closeForm="closeForm"
    @update:assetId="updateAssetId"
    @update:selectedNetwork="updateSelectedNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updatePartialFee"
    @update:recipient="updateRecipient"
  >
    <template v-slot:step2>
      <div>
        <div class="row direction-column">
          <FInput
            :value="accountsStore.selectedWallet.name"
            placeholder="assets.from"
            size="big"
            :readonly="true"
            data-testid="fromWallet"
          />

          <SIcon name="arrows-arrow-right-24" class="arrow-icon" />

          <FInput
            :value="formattedAddressTo"
            placeholder="assets.to"
            size="big"
            :readonly="true"
            data-testid="toAddress"
          />
        </div>

        <FCorners size="big" class="row">
          <div class="summary">
            <div class="summary-label">{{ $t('assets.summary') }}</div>

            <InfoRow text="assets.assetsAmount" :value="amountString" :price="valueString" />
            <InfoRow text="assets.networkFee" :value="partialFeeString" :price="fiatFeeString" />
            <InfoRow v-if="isUtilityAsset" text="assets.total" :value="totalString" :price="fiatTotalString" />
          </div>
        </FCorners>
      </div>
    </template>
  </TransferForm>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import TransferForm from '@/screens/wallet&asset/TransferForm.vue';
import { addNumbers } from '@/helpers/numbers';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();
const { n } = useI18n();

const partialFee = ref('');
const selectedNetwork = ref((route.params.network as string | undefined) ?? '');
const assetId = ref((route.params.assetId as string | undefined) ?? '');
const recipient = ref('');
const amount = ref('');
const value = ref('');

const currency = computed(() =>
  accountsStore.balances.find(({ balances }) =>
    balances.some(({ id }) => id.toLowerCase() === assetId.value.toLowerCase())
  )
);

const isUtilityAsset = computed(() =>
  currency.value?.balances.some(
    (balance) => balance.isUtility && isSameString(getBalanceNetworkName(balance), selectedNetwork.value)
  )
);

const partialFeeString = computed(() => {
  const utilityAsset = getUtilityAsset(accountsStore.balances, selectedNetwork.value);
  const symbol = utilityAsset ? utilityAsset.symbol : '';

  return `${n(+partialFee.value, 'decimalPrecise')} ${symbol.toUpperCase()}`;
});

const assetPrice = computed(() => networksStore.getAssetPrice(currency.value?.priceId ?? '')?.price ?? 0);

const originNet = computed(() => networksStore.getNetwork(selectedNetwork.value));
const originalUtilityId = computed(() => originNet.value?.assets[0].id ?? '');

const feeAssetPrice = computed(() => {
  const feeCurrency = accountsStore.balances.find(({ balances }) =>
    balances.some(({ id }) => id === originalUtilityId.value)
  );
  const priceId = feeCurrency?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const fiatFeeString = computed(
  () => `${accountsStore.fiatSymbol}${n(+partialFee.value * feeAssetPrice.value, 'price')}`
);

const valueString = computed(() => `${accountsStore.fiatSymbol}${n(+value.value, 'price')}`);

const selectedAsset = computed(() =>
  currency.value?.balances?.find(
    (el) =>
      el.symbol.toLowerCase() === assetId.value.toLowerCase() || el.id.toLowerCase() === assetId.value.toLowerCase()
  )
);

const selectedAssetUpper = computed(() => selectedAsset.value?.symbol.toUpperCase() ?? '');

const amountString = computed(() => `${+amount.value} ${selectedAssetUpper.value}`);

const formattedAddressTo = computed(() => {
  const currentRecipient = recipient.value;

  if (currentRecipient.length <= 15) return currentRecipient;

  return `${currentRecipient.slice(0, 7)}...${currentRecipient.slice(-8)}`;
});

const total = computed(() => +addNumbers([amount.value, partialFee.value]));

const totalString = computed(() => `${n(total.value, 'decimalPrecise')} ${selectedAssetUpper.value}`);

const fiatTotalString = computed(() => `${accountsStore.fiatSymbol}${n(total.value * assetPrice.value, 'price')}`);

function closeForm() {
  router.back();
}

function updateAssetId(valueToSet: string) {
  assetId.value = valueToSet;
}

function updateSelectedNetwork(valueToSet: string) {
  selectedNetwork.value = valueToSet;
}

function updateRecipient(valueToSet: string) {
  recipient.value = valueToSet;
}

function updateAmount(valueToSet: string) {
  amount.value = valueToSet;
}

function updateValue(valueToSet: string) {
  value.value = valueToSet;
}

function updatePartialFee(valueToSet: string) {
  partialFee.value = valueToSet;
}
</script>

<style lang="scss" scoped>
.direction-column {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .arrow-icon {
    color: $default-white;
  }
}

.summary {
  padding: 16px;
  background-color: $secondary-background-color !important;
  border: 1px solid $default-background-color !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;

  .summary-label {
    text-align: left;
    font-size: 1.125em;
    font-weight: 600;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    margin: 24px 0;

    &:last-child {
      margin-bottom: 5px;
    }

    .name {
      color: $gray-color;
    }

    .column {
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .value {
        color: $default-white;
        font-weight: 300;
        font-size: 0.75rem;
        margin-top: 3px;
      }
    }
  }
}
</style>
