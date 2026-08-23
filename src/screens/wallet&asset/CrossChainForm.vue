<template>
  <AboveForm v-if="!reviewedRoute" :fullScreen="true" header="Cross-chain" @closeHandler="closeForm">
    <div class="route-unavailable">
      <Icon icon="info" className="route-unavailable__icon" :hover="false" />
      <strong>No supported route</strong>
      <span>This route is missing, changed, or is no longer in the reviewed registry.</span>
      <FButton size="big" text="common.back" width="100%" @click="closeForm" />
    </div>
  </AboveForm>

  <TransferForm
    v-else
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
    :isDisableBtn="showSoraAlert || !reviewedRoute.enabled"
    :canonicalAssetKey="reviewedRoute.assetKey"
    :reviewedRouteId="reviewedRoute.id"
    :reviewedRouteProviderId="reviewedRoute.providerId"
    :lockRouteSelection="true"
    @update:assetId="updateAssetId"
    @update:selectedNetwork="updateOriginalNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updateOriginNetFee"
    @update:destNetFee="updateDestNetFee"
    @update:runtimeMinimum="updateRuntimeMinimum"
    @update:destinationNetwork="setDestinationNetwork"
    @update:recipient="updateRecipient"
    @closeForm="closeForm"
  >
    <template v-slot:step1Warning>
      <Alert v-if="showSoraAlert" :message="soraCrossChainALert" />
      <Alert v-if="!reviewedRoute.enabled" :message="reviewedRoute.disabledReason" />
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
            <InfoRow text="Protocol" data-testid="protocolCC" :value="reviewedRoute.protocol" />

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

            <InfoRow text="Minimum" data-testid="minimumCC" :value="runtimeMinimumString" />
          </div>

          <Tooltip text="assets.feeDescription" target=".origin-fee" placement="right" />
          <Tooltip text="assets.feeDescription" target=".cross-chain-fee" placement="right" />
        </FCorners>
      </div>
    </template>
  </TransferForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import TransferForm from './TransferForm.vue';
import { firstCharToUp, cut, isSora } from '@/helpers/';
import { formattedNumber } from '@/helpers/numbers';
import { BRIDGE_MIN_VALUES_TO_SORA, BRIDGE_MIN_VALUES_FROM_SORA } from '@/consts/sora';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import {
  buildOwnedCrossChainAssets,
  findReviewedCrossChainRoute,
  type CrossChainOwnedAsset,
  type ReviewedCrossChainRoute,
} from '@/cross-chain/routeRegistry';

export default defineComponent({ name: 'CrossChainForm',
  components: { TransferForm },
  props: {
    _originalNetwork: String,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      extensionStore: useExtensionStore(),
      originNetFee: '',
      destNetFee: '',
      assetId: '',
      originalNetwork: '',
      destinationNetwork: '',
      amount: '',
      recipient: '',
      value: '',
      runtimeMinimum: '',
    };
  },
  computed: {
    routeId() {
      const value = this.$route.query.routeId;

      return Array.isArray(value) ? value[0] ?? '' : value ?? '';
    },
    ownedRouteAssets(): CrossChainOwnedAsset[] {
      return buildOwnedCrossChainAssets(this.accountsStore.balances, this.networksStore.allNetworks);
    },
    reviewedRoute() {
      return findReviewedCrossChainRoute(
        this.routeId,
        this.ownedRouteAssets,
        this.networksStore.allNetworks,
        this.extensionStore.features?.actions ?? {}
      );
    },
    routeAsset() {
      return this.ownedRouteAssets.find(({ key }) => key === this.reviewedRoute?.assetKey);
    },
    minValueBridgeToSora() {
      return BRIDGE_MIN_VALUES_TO_SORA[this.originalNetwork.toLowerCase()]?.[this.assetName.toLowerCase()] ?? 0;
    },
    minValueBridgeFromSora() {
      return BRIDGE_MIN_VALUES_FROM_SORA[this.destinationNetwork.toLowerCase()]?.[this.assetName.toLowerCase()] ?? 0;
    },
    showSoraAlert() {
      if (!isSora(this.originalNetwork, true) && !isSora(this.destinationNetwork, true)) return false;

          if (this.amount === '') return false;

          if (isSora(this.destinationNetwork, true)) return +this.amount < this.minValueBridgeToSora;

          return +this.amount < this.minValueBridgeFromSora;
    },
    soraCrossChainALert() {
      const value = isSora(this.destinationNetwork, true) ? this.minValueBridgeToSora : this.minValueBridgeFromSora;

          return this.$t('assets.soraCrossChainALert', { value, asset: this.assetName });
    },
    directionText() {
      return `${this.$t('assets.from')} ${this.originalNetwork} ${this.$t('assets.to')} ${this.destinationNetwork} `;
    },
    showValue() {
      return this.value !== '0';
    },
    originalNetworkString() {
      return `${firstCharToUp(this.originalNetwork)}`;
    },
    destinationNetworkString() {
      return `${firstCharToUp(this.destinationNetwork)}`;
    },
    amountString() {
      return `${this.amount} ${this.assetName}`;
    },
    valueString() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.value, 'price')}`;
    },
    originalNetworkFeeString() {
      return `${formattedNumber(+this.originNetFee, { decimalsValue: 7 })} ${this.originalNetworkUtilityAssetUpper}`;
    },
    destinationNetworkFeeString() {
      return `${formattedNumber(+this.destNetFee)} ${this.assetName}`;
    },
    runtimeMinimumString() {
      const value = this.runtimeMinimum || this.reviewedRoute?.minimum || '0';

      return `${value} ${this.assetName}`;
    },
    currency() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.routeAsset?.groupId);
    },
    assetName() {
      return (this.routeAsset?.symbol ?? this.currency?.symbol ?? '').toUpperCase();
    },
    originNet() {
      return this.networksStore.getNetwork(this.originalNetwork);
    },
    destNet() {
      return this.networksStore.getNetwork(this.destinationNetwork);
    },
    originNetIcon() {
      return this.originNet?.icon ?? '';
    },
    destNetIcon() {
      return this.destNet?.icon ?? '';
    },
    originalNetworkUtilityAsset() {
      const utilityId = this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
          const currency = this.accountsStore.balances.find(({ balances }) => balances.some(({ id }) => id === utilityId));

          return currency?.symbol ?? '';
    },
    originalNetworkUtilityAssetUpper() {
      return this.originalNetworkUtilityAsset.toUpperCase();
    },
  },
  created() {
    this.assetId = this.$route.params.assetId;
        this.originalNetwork = this.$route.params.network;
  },
  watch: {
    reviewedRoute: {
      immediate: true,
      handler(route: ReviewedCrossChainRoute | undefined) {
        if (!route) return;

        this.assetId = route.assetId;
        this.originalNetwork = route.originNetwork;
        this.destinationNetwork = route.destinationNetwork;
      },
    },
  },
  methods: {
    closeForm() {
      this.$router.back();
    },
    cut(value: string) {
      return cut(value);
    },
    updateAssetId(value: string) {
      this.assetId = value;
    },
    updateOriginalNetwork(value: string) {
      this.originalNetwork = value;
    },
    setDestinationNetwork(value: string) {
      this.destinationNetwork = value;
    },
    updateAmount(value: string) {
      this.amount = value;
    },
    updateValue(value: string) {
      this.value = value;
    },
    updateOriginNetFee(value: string) {
      this.originNetFee = value;
    },
    updateDestNetFee(value: string) {
      this.destNetFee = value;
    },
    updateRuntimeMinimum(value: string) {
      this.runtimeMinimum = value;
    },
    updateRecipient(value: string) {
      this.recipient = value;
    },
  },
});
</script>

<style lang="scss" scoped>
.route-unavailable {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: $gray-color;
  text-align: center;

  strong {
    color: $plain-white;
  }

  &__icon {
    width: 30px;
    margin: 0 auto;
  }
}

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
