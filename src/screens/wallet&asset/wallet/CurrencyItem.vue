<template>
  <div class="currency-item" @click="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>
    <div class="img-container">
      <ExternalLogo class="asset-icon" :name="assetData.icon" :width="42" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>{{ tokenName }}</div>

        <template>
          <Shimmer v-if="showShimmers" height="14px" width="60px" />

          <template v-else-if="!showWarning">
            <div class="available-networks">
              <ExternalLogo
                v-for="{ icon, name } in networkBadges"
                class="minor-network-img"
                :key="name"
                :name="icon"
                :width="12"
              />

              <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
            </div>
          </template>
        </template>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow">{{ assetData.symbol.toUpperCase() }}</div>

        <Shimmer v-if="showShimmers" height="23px" width="60px" />

        <div v-else-if="!showWarning" class="count-assets overflow">
          {{ totalAssetBalanceValue }}
        </div>
      </div>
      <div class="row third-row">
        <div class="price row">
          {{ assetPrice }}

          <div :class="changePriceClasses">{{ assetPriceChange }}</div>
        </div>

        <Shimmer v-if="showShimmers" height="14px" width="70px" />

        <div v-else-if="!showWarning" class="total-balance overflow">
          {{ transferableFiatBalanceValue }}
        </div>
      </div>
    </div>
    <div class="activity">
      <template v-if="showWarning">
        <Icon icon="info-triangle" className="warning-img" @click.native="$emit('toggleNetworkManagementVisible')" />

        <Tooltip text="common.networkDisconnected" target=".warning-img" placement="left" />
      </template>

      <template v-else-if="!showAssetsManagementForm">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="assets.sendButtonText"
          target=".send"
          @click="toggleVisibleActivityForm('showSendForm', true, { mainNetwork, assetId })"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="assets.receiveButtonText"
          target=".receive"
          @click="toggleVisibleActivityForm('showReceiveForm', true, { mainNetwork, assetId })"
        />

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          backgroundColorHover="black"
          class="details"
          tooltipText="wallet.assetDetails"
          target=".details"
        />
      </template>

      <Switcher v-else v-model="currencyVisible" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { CustomEvent, Fn, ToggleFnProp } from '@/interfaces';
import type { SetHiddenAsset, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { ALL_NETWORKS } from '@/consts/networks';
import { GetAssetPrice, GetNetwork } from '@/store/networks/types';
import {
  filterBalanceItemsByNetwork,
  getSummaryTransferableBalanceFilteredByActiveNetworks,
} from '@/helpers/currencies';
import { APIItemState, NETWORK_STATUS } from '@/extension/background/extension-base/src/api/types/networks';

@Component
export default class CurrencyItem extends Vue {
  readonly countDisplayedNetworks = 5;

  @Prop(Object) assetData!: TokenBalance;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop({ required: false }) timeoutCallback!: (fn: () => void) => VoidFunction;
  @Prop(Function) toggleVisibleActivityForm!: ToggleFnProp;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_HIDDEN_ASSET) setHiddenAssets!: Fn<SetHiddenAsset>;

  get networkJson() {
    return this.getNetwork(this.selectedNetwork);
  }

  get filteredBalances() {
    return this.assetData.balances.filter(
      ({ transferable, state }) => state === APIItemState.READY && transferable !== '0'
    );
  }

  get balancesLength() {
    return this.filteredBalances.length;
  }

  get isAdditional() {
    return this.balancesLength > this.countDisplayedNetworks;
  }

  get additionalCount() {
    return this.balancesLength - (this.countDisplayedNetworks - 1);
  }

  get tokenName() {
    return this.assetData.tokenName.toUpperCase() ?? '';
  }

  get mainNetwork() {
    return this.assetData.mainNetwork;
  }

  get assetId() {
    return this.assetData.assetId;
  }

  get tokenPrice() {
    return this.getTokenPrice(this.assetData.priceId ?? '');
  }

  get currencyVisible(): boolean {
    return !this.hiddenAssets.includes(this.assetData.assetId);
  }

  set currencyVisible(value: boolean) {
    this.setHiddenAssets({ assetId: this.assetData.assetId, value });
  }

  get showCurrencyItem() {
    return this.showAssetsManagementForm || this.currencyVisible;
  }

  get networkBadges() {
    if (this.isCurrentNetwork) {
      const { icon, name } = this.assetData.balances.find((balance) => {
        return filterBalanceItemsByNetwork(balance, this.selectedNetwork);
      })!;

      return [{ icon, name }];
    }

    if (this.isAdditional) return this.filteredBalances.splice(0, this.countDisplayedNetworks - 1);

    return this.filteredBalances;
  }

  get allNetworkBadges() {
    return this.assetData.balances;
  }

  get showShimmers() {
    // Убираем шимммер если баланс загружен хотя бы в одной сети
    return !this.assetData.balances.some(({ state }) => state === APIItemState.READY);
  }

  get showWarning() {
    return (
      this.assetData.balances.some((el) => el.state === APIItemState.ERROR) ||
      this.networkJson?.apiStatus === NETWORK_STATUS.DISCONNECTED
    );
  }

  get assetPrice() {
    return `${this.fiatSymbol}${this.$n(this.tokenPrice.price, 'price')}`;
  }

  get transferableFiatBalanceValue() {
    return `${this.fiatSymbol}${this.$n(this.transferableFiatBalance, 'price')}`;
  }

  get assetPriceChange() {
    if (this.tokenPrice.priceChange === 0) return '';

    return this.$n(this.tokenPrice.priceChange, 'percent');
  }

  get totalAssetBalanceValue() {
    return this.$n(this.transferableAssetBalance, 'decimal');
  }

  get transferableAssetBalance() {
    return +getSummaryTransferableBalanceFilteredByActiveNetworks(this.assetData, this.selectedNetwork);
  }

  get transferableFiatBalance() {
    return this.transferableAssetBalance * this.tokenPrice.price;
  }

  get changePriceClasses() {
    const classes = ['price-change'];

    if (this.tokenPrice.priceChange > 0) classes.push('up-price');
    else if (this.tokenPrice.priceChange < 0) classes.push('down-price');

    return classes;
  }

  get isCurrentNetwork() {
    return this.selectedNetwork !== ALL_NETWORKS;
  }

  get redirectNetwork(): string {
    const network = this.assetData.balances[0];

    return this.isCurrentNetwork
      ? this.selectedNetwork
      : this.mainNetwork !== undefined
      ? this.mainNetwork
      : network.name;
  }

  openAssetPage(event: CustomEvent) {
    if (this.showWarning) return;

    const classList = event.target?.classList;

    if (
      this.showAssetsManagementForm ||
      classList.contains('button') ||
      classList.contains('send-white') ||
      classList.contains('receive-white')
    )
      return;

    this.$router.push({
      name: Components.Asset,
      params: {
        assetId: this.assetData.assetId,
        network: this.redirectNetwork,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.currency-item {
  display: flex;
  padding: 8px 0 8px 14px;
  border-bottom: $default-border;
  margin-right: 16px;
  align-items: center;
  height: 80px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }

  &:last-child {
    border-bottom: none;
  }

  .drag-icon {
    margin: auto 20px auto 0;

    &:hover {
      cursor: pointer;
    }

    i {
      color: #fff;
    }
  }

  .descriptions-column {
    width: 100%;

    .row {
      display: flex;
      justify-content: space-between;
    }

    .first-row {
      font-size: 12px;
      color: $gray-color;
      margin-bottom: 5px;
      height: 14px;

      .available-networks {
        display: flex;
      }

      .additional {
        border-radius: 50%;

        &:hover {
          cursor: pointer;
        }
      }
    }

    .second-row {
      font-weight: 700;
      margin-bottom: 5px;

      .currency-name {
        font-size: 20px;
        text-transform: uppercase;
        max-width: 220px;
      }

      .count-assets {
        max-width: 200px;
        font-size: 18px;
        margin: auto 0;
      }
    }

    .third-row {
      display: flex;
      font-size: 12px;
      color: $default-white;
      height: 14px;

      .price {
        max-width: 100px;
      }

      .price-change {
        margin-left: 2px;
      }

      .total-balance {
        max-width: 200px;
      }
    }
  }

  .overflow {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .second-row-left {
    font-size: 20px;
  }

  .activity {
    display: flex;
    align-items: center;
    margin-left: 16px;
  }

  .button {
    margin-right: 7px;
  }

  .warning-img {
    width: 28px;
    height: 28px;
    opacity: 0.9;

    &:hover {
      opacity: 1;
    }
  }

  .img-container {
    margin: auto;
    user-select: none;

    .asset-icon {
      margin-right: 13px;
    }
  }

  .minor-network-img {
    margin-right: 3px;
    opacity: 0.5;
    user-select: none;

    &:last-child {
      margin-right: 0;
    }
  }
}
</style>
