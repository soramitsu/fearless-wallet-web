<template>
  <div v-if="showCurrencyItem" class="currency-item" @click="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>
    <div class="img-container">
      <ExternalLogo class="asset-icon" :name="assetData.icon" :width="42" :alt="assetData.symbol" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div data-testid="tokenName">{{ tokenName }}</div>

        <template>
          <Shimmer v-if="showShimmers" height="14px" width="60px" />

          <template v-else-if="!showWarning">
            <div class="available-networks">
              <ExternalLogo
                v-for="{ icon, name } in networkBadges"
                class="minor-network-img"
                :key="name"
                :name="icon"
                :altName="name"
                :width="12"
              />

              <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
            </div>
          </template>
        </template>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow" data-testid="currencyName">{{ assetData.symbol.toUpperCase() }}</div>

        <Shimmer v-if="showShimmers" height="23px" width="60px" />

        <div v-else-if="!showWarning" class="count-assets overflow" data-test-id="countAssets">
          {{ totalAssetBalanceValue }}
        </div>
      </div>
      <div class="row third-row">
        <div class="price row" data-testid="price">
          {{ assetPrice }}

          <div :class="changePriceClasses" data-testid="changePrice">{{ assetPriceChange }}</div>
        </div>

        <Shimmer v-if="showShimmers" height="14px" width="70px" />

        <div v-else-if="!showWarning" class="total-balance overflow" data-testid="totalBalance">
          {{ transferableFiatBalanceValue }}
        </div>
      </div>
    </div>
    <div class="activity">
      <template v-if="showWarning">
        <Icon icon="info-triangle" className="warning-img" @click.native="$emit('toggleNetworkManagementVisible')" />

        <Tooltip text="common.networkDisconnected" target=".warning-img" placement="left" />
      </template>

      <Switcher v-if="showAssetsManagementForm" v-model="currencyVisible" />

      <template v-else-if="!showWarning">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="assets.sendButtonText"
          target=".send"
          data-testid="sendBtn"
          @click="$emit('toggleVisibleActivityForm', 'showSendForm', { mainNetwork, assetId })"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="assets.receiveButtonText"
          target=".receive"
          data-testid="receiveBtn"
          @click="$emit('toggleVisibleActivityForm', 'showReceiveForm', { mainNetwork, assetId })"
        />

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          backgroundColorHover="black"
          class="details"
          tooltipText="wallet.assetDetails"
          target=".details"
          data-testid="detailsBtn"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { APIItemState, NETWORK_STATUS } from '@extension-base//api/types/networks';
import type { CustomEvent, Fn } from '@/interfaces';
import type { SetHiddenAsset, SelectedWallet } from '@/store';
import type { AccountJson, TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { Components } from '@/router/routes';
import { type GetAssetPrice, type GetNetwork } from '@/store/networks/types';
import {
  filterBalanceItemsByNetwork,
  getSummaryTransferableBalanceFilteredByActiveNetworks,
} from '@/helpers/currencies';
import { isNetworkGroup } from '@/helpers/common';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

@Component
export default class CurrencyItem extends Vue {
  readonly countDisplayedNetworks = 5;

  @Prop(Object) assetData!: TokenBalance;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop({ required: false }) timeoutCallback!: (fn: () => void) => VoidFunction;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(AccountsMutationTypes.SET_HIDDEN_ASSET) setHiddenAssets!: Fn<SetHiddenAsset>;

  get networkJson() {
    return this.getNetwork(this.selectedNetwork);
  }

  get filteredBalances() {
    return this.assetData.balances.filter(({ state, name }) => {
      if (this.selectedWallet.isMobile) {
        const accounts: AccountJson[] = this.accounts;
        const account = accounts.find(({ address }) => address === this.selectedWallet.address);
        const network = this.getNetwork(name);

        if (account && account.chains) {
          return account.chains.some((halfchainId) => {
            if (network && network.chainId)
              return network.chainId.includes(halfchainId) && state === APIItemState.READY;

            return false;
          });
        }
      }

      return state === APIItemState.READY;
    });
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
    if (this.assetData.relayChain === 'ethereum' && !isNetworkGroup(this.selectedNetwork))
      return this.assetData.balances
        .find((el) => el.name.toLowerCase() === this.selectedNetwork.toLowerCase())
        ?.name?.toLowerCase();

    return this.assetData.mainNetwork?.toLowerCase();
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
        const account = this.accounts.find(({ address }) => address === this.selectedWallet.address);
        const network = this.getNetwork(balance.name);

        if (account && account.chains) {
          if (!account.chains.some((el) => network.chainId.includes(el))) return false;
        }

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
    if (this.showWarning) return false;

    // Убираем шимммер если баланс загружен хотя бы в одной сети
    return !this.assetData.balances.some(({ state }) => state === APIItemState.READY);
  }

  get showWarning() {
    if (!isNetworkGroup(this.selectedNetwork)) return this.networkJson?.networkStatus === NETWORK_STATUS.DISCONNECTED;

    // Если все сети токена в статусе DISCONNECTED, то показываем ошибку
    const allNetworksDisconnected = this.assetData.balances.every(({ name }) => {
      const network = this.getNetwork(name);

      return network.networkStatus === NETWORK_STATUS.DISCONNECTED;
    });

    if (allNetworksDisconnected) return true;

    return (
      this.assetData.balances.some((el) => el.state === APIItemState.ERROR && el.name === this.selectedNetwork) ||
      this.assetData.balances.every((el) => el.state === APIItemState.ERROR)
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
    return !isNetworkGroup(this.selectedNetwork);
  }

  get redirectNetwork(): string {
    return this.isCurrentNetwork ? this.selectedNetwork : '';
  }

  get computeActiveNetworks() {
    return this.assetData.balances.filter(({ name }) => {
      const network = this.getNetwork(name);

      if (this.selectedNetwork === POPULAR_NETWORKS) return network.rank !== undefined;
      if (this.selectedNetwork === FAVORITE_NETWORKS)
        return network.favorite.some((address) => address === this.selectedWallet.address);

      return this.getNetwork(name).active;
    });
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

    if (this.isCurrentNetwork || this.computeActiveNetworks.length === 1) {
      this.$router.push({
        name: Components.AssetHistory,
        params: {
          assetId: this.assetId ?? this.assetData.assetId,
          selectedNetwork: this.redirectNetwork === '' ? this.computeActiveNetworks[0].name : this.redirectNetwork,
        },
      });

      return;
    }

    this.$router.push({
      name: Components.AssetNetworks,
      params: {
        assetId: this.assetData.assetId,
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
    margin-right: 10px;

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
