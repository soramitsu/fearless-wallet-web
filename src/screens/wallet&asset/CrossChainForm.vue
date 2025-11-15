<template>
  <TransferForm
    extrinsicType="crossChain"
    header="assets.crossChain"
    :assetId="assetId"
    :selectedNetwork="originalNetwork"
    :amount="amount"
    :value="value"
    :partialFee="originNetFee"
    :destNetFee="destNetFee"
    :destinationNetwork="destinationNetwork"
    :recipient="recipient"
    :isDisableBtn="showSoraAlert"
    @update:assetId="updateAssetId"
    @update:selectedNetwork="updateOriginalNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updateOriginNetFee"
    @update:destNetFee="updateDestNetFee"
    @update:destinationNetwork="setDestinationNetwork"
    @update:recipient="updateRecipient"
    @closeForm="closeForm"
  >
    <template v-slot:step1Warning>
      <Alert v-if="showSoraAlert" :message="soraCrossChainALert" />
    </template>

    <template v-slot:step2>
      <div class="cross-chain">
        <div class="direction">
          <ExternalLogo :name="originNetIcon" :width="42" />

          <div class="asset-logo">
            <div class="hr"></div>

            <div class="background-circle">
              <ExternalLogo v-if="currency" :name="currency.icon" :width="87" />
            </div>

            <div class="hr"></div>
          </div>

          <ExternalLogo :name="destNetIcon" :width="42" />
        </div>

        <FCorners size="big" class="row">
          <div class="summary">
            <InfoRow text="assets.direction" data-testid="directionCC" :value="directionText" />

            <InfoRow
              text="assets.assetsAmount"
              data-testid="amountCC"
              :value="amountString"
              :price="showValue ? valueString : ''"
            />

            <InfoRow text="assets.sendTo" data-testid="sendToCC" :value="cut(recipient)" />

            <InfoRow
              text="assets.originalNetworkFee"
              data-testid="originalNetworkFee"
              :value="originalNetworkFeeString"
              icon="info"
              :iconClasses="['origin-fee']"
            />

            <InfoRow
              text="assets.crossChainFee"
              data-testid="crossChainFee"
              :value="destinationNetworkFeeString"
              icon="info"
              :iconClasses="['cross-chain-fee']"
            />
          </div>

          <Tooltip text="assets.feeDescription" target=".origin-fee" placement="right" />
          <Tooltip text="assets.feeDescription" target=".cross-chain-fee" placement="right" />
        </FCorners>
      </div>
    </template>
  </TransferForm>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import TransferForm from './TransferForm.vue';
import { cut as cutValue, isSora, isSameString } from '@/helpers';
import { formattedNumber } from '@/helpers/numbers';
import { BRIDGE_MIN_VALUES_TO_SORA, BRIDGE_MIN_VALUES_FROM_SORA } from '@/consts/sora';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  _originalNetwork?: string;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();
const { t, n } = useI18n();

const originNetFee = ref('');
const destNetFee = ref('');
const assetId = ref('');
const originalNetwork = ref('');
const destinationNetwork = ref('');
const amount = ref('');
const recipient = ref('');
const value = ref('');

const currency = computed(() =>
  accountsStore.balances.find(({ groupId, balances }) => {
    return groupId === assetId.value || balances.some(({ id }) => id.toLowerCase() === assetId.value.toLowerCase());
  })
);

const assetName = computed(() => (currency.value?.symbol ?? '').toUpperCase());

const minValueBridgeToSora = computed(() => {
  const network = originalNetwork.value.toLowerCase();
  const asset = assetName.value.toLowerCase();

  return BRIDGE_MIN_VALUES_TO_SORA[network]?.[asset] ?? 0;
});

const minValueBridgeFromSora = computed(() => {
  const network = destinationNetwork.value.toLowerCase();
  const asset = assetName.value.toLowerCase();

  return BRIDGE_MIN_VALUES_FROM_SORA[network]?.[asset] ?? 0;
});

const showSoraAlert = computed(() => {
  if (!isSora(originalNetwork.value, true) && !isSora(destinationNetwork.value, true)) return false;
  if (amount.value === '') return false;

  if (isSora(destinationNetwork.value, true)) return +amount.value < minValueBridgeToSora.value;

  return +amount.value < minValueBridgeFromSora.value;
});

const soraCrossChainALert = computed(() => {
  const threshold = isSora(destinationNetwork.value, true) ? minValueBridgeToSora.value : minValueBridgeFromSora.value;

  return t('assets.soraCrossChainALert', { value: threshold, asset: assetName.value });
});

const directionText = computed(
  () => `${t('assets.from')} ${originalNetwork.value} ${t('assets.to')} ${destinationNetwork.value} `
);

const showValue = computed(() => value.value !== '0');
const amountString = computed(() => `${+amount.value} ${assetName.value}`);
const valueString = computed(() => `${accountsStore.fiatSymbol}${n(+value.value, 'price')}`);

const originNet = computed(() => networksStore.getNetwork(originalNetwork.value));
const destNet = computed(() => networksStore.getNetwork(destinationNetwork.value));
const originNetIcon = computed(() => originNet.value?.icon ?? '');
const destNetIcon = computed(() => destNet.value?.icon ?? '');

const originalNetworkUtilityAsset = computed(() => {
  const utilityId = originNet.value?.assets[0].id ?? '';
  const currencyMatch = accountsStore.balances.find(({ balances }) => balances.some(({ id }) => id === utilityId));

  return currencyMatch?.symbol ?? '';
});

const originalNetworkUtilityAssetUpper = computed(() => originalNetworkUtilityAsset.value.toUpperCase());

const originalNetworkFeeString = computed(
  () => `${formattedNumber(+originNetFee.value, { decimalsValue: 7 })} ${originalNetworkUtilityAssetUpper.value}`
);

const destinationNetworkFeeString = computed(() => `${formattedNumber(+destNetFee.value)} ${assetName.value}`);

function closeForm() {
  router.back();
}

function cut(text: string) {
  return cutValue(text);
}

function updateAssetId(valueToSet: string) {
  assetId.value = valueToSet;
}

function updateOriginalNetwork(valueToSet: string) {
  originalNetwork.value = valueToSet;
}

function setDestinationNetwork(valueToSet: string) {
  destinationNetwork.value = valueToSet;
}

function updateAmount(valueToSet: string) {
  amount.value = valueToSet;
}

function updateValue(valueToSet: string) {
  value.value = valueToSet;
}

function updateOriginNetFee(valueToSet: string) {
  originNetFee.value = valueToSet;
}

function updateDestNetFee(valueToSet: string) {
  destNetFee.value = valueToSet;
}

function updateRecipient(valueToSet: string) {
  recipient.value = valueToSet;
}

onMounted(async () => {
  assetId.value = (route.params.assetId as string) ?? '';
  originalNetwork.value = (route.params.network as string) ?? props._originalNetwork ?? '';

  await nextTick();

  const originNetwork = networksStore.getNetwork(originalNetwork.value);
  const asset = getNativeAssetName(assetName.value);

  const destChainId = originNetwork?.xcm?.availableDestinations.find(({ assets }) =>
    assets.some(({ symbol }) => isSameString(symbol, asset))
  )?.chainId;

  if (!destChainId) return;

  const dest = networksStore.getNetwork(destChainId);

  if (dest) destinationNetwork.value = dest.name;
});
</script>

<style lang="scss" scoped>
.summary {
  background-color: $secondary-background-color !important;
  border: 1px solid $default-background-color !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  margin-bottom: 15px;
}

.direction {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 180px;

  .asset-logo {
    display: flex;
    align-items: center;
    margin: 0 10px;

    .hr {
      width: 135px;
      border: none;
      height: 1px;
      background: repeating-linear-gradient(90deg, $gray-color, $gray-color, 6px, transparent 6px, transparent 12px);
    }
  }
}
</style>
