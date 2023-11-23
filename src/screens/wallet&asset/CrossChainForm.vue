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
    @update:assetId="updateAssetId"
    @update:selectedNetwork="updateOriginalNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updateOriginNetFee"
    @update:destNetFee="updateDestNetFee"
    @update:destinationNetwork="setDestinationNetwork"
    @update:recipient="updateRecipient"
    @closeForm="$emit('closeForm')"
  >
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
          <InfoRow text="assets.direction" :value="directionText" />

          <InfoRow text="assets.assetsAmount" :value="amountString" :price="showValue ? valueString : ''" />

          <InfoRow text="assets.sendTo" :value="cut(recipient)" />

          <InfoRow
            text="assets.originalNetworkFee"
            :value="originalNetworkPartialFeeString"
            icon="info"
            :iconClasses="['origin-fee']"
          />

          <InfoRow
            text="assets.crossChainFee"
            :value="destinationNetworkPartialFeeString"
            icon="info"
            :iconClasses="['cross-chain-fee']"
          />
        </div>

        <Tooltip text="assets.feeDescription" target=".origin-fee" placement="right" />
        <Tooltip text="assets.feeDescription" target=".cross-chain-fee" placement="right" />
      </FCorners>
    </div>
  </TransferForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import TransferForm from './TransferForm.vue';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet, GetNetwork } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { firstCharToUp, cut } from '@/helpers/';
import { formattedNumber } from '@/helpers/numbers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: { TransferForm },
})
export default class CrossChainForm extends Vue {
  originNetFee = '';
  destNetFee = '';
  assetId = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';
  recipient = '';
  value = '';
  step = 1;

  @Prop(String) _originalNetwork!: string;
  @Prop(String) _selectedAssetId!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get directionText() {
    return `${this.$t('assets.from')} ${this.originalNetwork} ${this.$t('assets.to')} ${this.destinationNetwork} `;
  }

  get showValue() {
    return this.value !== '0';
  }

  get originalNetworkString() {
    return `${firstCharToUp(this.originalNetwork)}`;
  }

  get destinationNetworkString() {
    return `${firstCharToUp(this.destinationNetwork)}`;
  }

  get amountString() {
    return `${+this.amount} ${this.assetName}`;
  }

  get valueString() {
    return `${this.fiatSymbol}${this.$n(+this.value, 'price')}`;
  }

  get originalNetworkPartialFeeString() {
    return `${formattedNumber(+this.originNetFee, { decimalsValue: 7 })} ${this.originalNetworkUtilityAssetUpper}`;
  }

  get destinationNetworkPartialFeeString() {
    return `${formattedNumber(+this.destNetFee)} ${this.assetName}`;
  }

  get currency() {
    return this.balances.find(({ assetId, balances }) => {
      return assetId === this.assetId || balances.some(({ id }) => id.toLowerCase() === this.assetId.toLowerCase());
    });
  }

  get assetName() {
    return (this.currency?.symbol ?? '').toUpperCase();
  }

  get originNet() {
    return this.getNetwork(this.originalNetwork);
  }

  get destNet() {
    return this.getNetwork(this.destinationNetwork);
  }

  get originNetIcon() {
    return this.originNet?.icon ?? '';
  }

  get destNetIcon() {
    return this.destNet?.icon ?? '';
  }

  get originalNetworkUtilityAsset() {
    const utilityId = this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
    const currency = this.balances.find(({ balances }) => balances.some(({ id }) => id === utilityId));

    return currency?.symbol ?? '';
  }

  get originalNetworkUtilityAssetUpper() {
    return this.originalNetworkUtilityAsset.toUpperCase();
  }

  created() {
    this.assetId = this._selectedAssetId;
    this.originalNetwork = this._originalNetwork;

    this.$nextTick(() => {
      const originNet = this.getNetwork(this._originalNetwork);
      const asset = getNativeAssetName(this.assetName);

      const destChainId = originNet?.xcm?.availableDestinations.find(({ assets }) =>
        assets.some(({ symbol }) => symbol.toLowerCase() === asset.toLowerCase())
      )?.chainId;

      if (!destChainId) return;

      const { name: destName } = this.getNetwork(destChainId)!;

      this.destinationNetwork = destName;
    });
  }

  closeForm() {
    this.$emit('closeForm');
  }

  cut(value: string) {
    return cut(value);
  }

  updateAssetId(value: string) {
    this.assetId = value;
  }

  updateOriginalNetwork(value: string) {
    this.originalNetwork = value;
  }

  setDestinationNetwork(value: string) {
    this.destinationNetwork = value;
  }

  updateAmount(value: string) {
    this.amount = value;
  }

  updateValue(value: string) {
    this.value = value;
  }

  updateOriginNetFee(value: string) {
    this.originNetFee = value;
  }

  updateDestNetFee(value: string) {
    this.destNetFee = value;
  }

  updateRecipient(value: string) {
    this.recipient = value;
  }
}
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
