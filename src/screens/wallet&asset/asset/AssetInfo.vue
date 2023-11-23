<template>
  <Fragment>
    <ContentForm :height="160" :isStaticHeight="true" :bottomRightCorner="true">
      <div class="asset-info">
        <div class="asset__icon">
          <ExternalLogo :name="icon" :width="82" />
        </div>

        <div class="asset-info__content">
          <div class="asset__price">
            <div class="asset__price-item asset__price-item-change">
              <span :class="changePriceClasses">{{ priceChangeString }}</span>
              <span :class="changePriceClasses">{{ fiatPriceChangeString }}</span>
            </div>

            <span class="asset__price-item">{{ assetPriceString }}</span>

            <div v-if="showSettingsPopup" @click="toggleDetailsPopup">
              <Icon icon="three-dots-vertical" className="asset__price-details" />
            </div>
          </div>

          <Shimmer v-if="showShimmers" height="14px" width="120px" />

          <div v-else class="asset__balance">{{ countAssetsString }}</div>

          <Shimmer v-if="showShimmers" height="14px" width="120px" />

          <span v-else class="asset__balance asset__balance--fiat">{{ transferableFiatBalanceInNetworkString }}</span>

          <div class="asset__locked" @click="toggleBalanceDetailsPopup">
            <div class="asset__locked-content">
              <span class="asset__locked-title">{{ $t('assets.locked') }}</span>

              <Shimmer v-if="showShimmers" height="14px" width="60px" />

              <span v-else>{{ lockedBalanceString }}</span>

              <Icon icon="info" class="details-icon" />
            </div>
          </div>
        </div>
      </div>
    </ContentForm>

    <BalanceDetailsPopup
      v-if="showBalanceDetailsPopup"
      :network="pickedNetwork"
      :currency="currency"
      :assetPrice="price"
      @closePopup="toggleBalanceDetailsPopup"
    />

    <AccountSettingsPopup
      v-if="showDetailsPopup"
      :selectedNetwork="selectedAssetNetwork"
      :showNodeSwitch="true"
      :showCopyAddress="false"
      :showExport="false"
      :showReplaceAccount="false"
      @handlerClose="toggleDetailsPopup"
    />
  </Fragment>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { AssetPrice } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getSummaryTransferableBalanceFilteredByActiveNetworks } from '@/helpers/currencies';
import { getSummaryLockedBalance } from '@/helpers/common';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import AccountSettingsPopup from '@/screens/accounts/AccountSettingsPopup.vue';

@Component({
  components: {
    BalanceDetailsPopup,
    AccountSettingsPopup,
  },
})
export default class AssetInfo extends Vue {
  showBalanceDetailsPopup = false;
  showDetailsPopup = false;

  @Prop(Object) price!: AssetPrice;
  @Prop(Object) currency!: TokenBalance;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetwork!: string;

  get selectedAssetNetwork() {
    return this.$route.params.selectedNetwork;
  }

  get pickedNetwork() {
    return this.selectedAssetNetwork ?? this.selectedNetwork;
  }

  get showShimmers() {
    return !navigator.onLine || !this.currency.balances?.some(({ state }) => state === APIItemState.READY);
  }

  get icon() {
    return this.currency?.icon ?? '';
  }

  get showSettingsPopup() {
    return this.selectedAssetNetwork !== '' && this.selectedAssetNetwork !== undefined;
  }

  get priceChangeString() {
    return this.$n(this.price.priceChange, 'percent');
  }

  get fiatPriceChangeString() {
    return `(${this.fiatSymbol}${this.$n(this.transferableFiatBalance * this.price.priceChange, 'price')})`;
  }

  get changePriceClasses() {
    const classes = ['price-change'];

    if (this.price.priceChange > 0) classes.push('up-price');
    else if (this.price.priceChange < 0) classes.push('down-price');

    return classes;
  }

  get assetPriceString() {
    return `1 ${this.selectedAssetUpper} = ${this.fiatSymbol}${this.$n(this.price.price, 'price')}`;
  }

  get transferableAssetBalance() {
    return +getSummaryTransferableBalanceFilteredByActiveNetworks(this.currency, this.pickedNetwork);
  }

  get lockedBalanceString() {
    const lockedBalance = getSummaryLockedBalance(this.currency);

    return `${this.$n(lockedBalance, 'decimal')} ${this.selectedAssetUpper}`;
  }

  get transferableFiatBalance() {
    return this.transferableAssetBalance * this.price.price;
  }

  get transferableFiatBalanceInNetworkString() {
    if (!this.currency) return `${this.fiatSymbol} 0`;

    return `${this.fiatSymbol} ${this.$n(this.transferableFiatBalance, 'price')}`;
  }
  get countAssetsString() {
    if (!this.currency) return `0 ${this.selectedAssetUpper}`;

    const total = this.$n(this.transferableAssetBalance, 'decimal');

    return `${total} ${this.selectedAssetUpper}`;
  }

  get selectedAsset() {
    return this.currency.symbol?.toLowerCase() ?? '';
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  toggleBalanceDetailsPopup() {
    this.showBalanceDetailsPopup = !this.showBalanceDetailsPopup;
  }

  toggleDetailsPopup() {
    this.showDetailsPopup = !this.showDetailsPopup;
  }
}
</script>

<style lang="scss" scoped>
.asset-info {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 20px;

  .asset__icon {
    background: $secondary-background-color;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    margin: 16px;
  }

  .asset-info__content {
    display: flex;
    justify-content: space-between;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;

    &:hover {
      cursor: pointer;
    }

    .asset__price {
      display: flex;
      flex-flow: row nowrap;
      font-family: Sora, sans-serif;
      color: $gray-color;
      line-height: 1px;

      .asset__price-item {
        font-size: 12px;
        font-weight: 400;
        border-right: solid 1px transparent;
        padding: 4px;
      }

      .asset__price-details {
        width: 24px;
        height: 24px;
        position: absolute;
        top: 15px;
        right: 10px;
        color: $default-white;
      }

      .asset__price-item-change {
        display: flex;
        flex-flow: row nowrap;
        gap: 4px;
      }

      > :first-child {
        border-right: solid 1px $gray-color;
        line-height: 1px;
        padding-left: 0px;
      }
    }

    .asset__balance {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 22px;
      font-style: normal;
      font-weight: 700;

      &--fiat {
        font-size: 18px;
      }
    }

    .asset__locked-content {
      display: flex;
      gap: 6px;
      align-items: center;

      .asset__locked-title {
        color: $default-white;
      }

      .details-icon {
        width: 14px;
        height: 14px;
        min-height: 14px;
        min-width: 14px;
        color: $grayish-white;

        &:hover {
          color: $default-white;
        }
      }
    }
  }
}
</style>
