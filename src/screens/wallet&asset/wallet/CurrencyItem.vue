<template>
  <Lazy v-if="showCurrencyItem" :timeoutCallback="timeoutCallback" class="currency-item" @click.native="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>
    <div class="img-container">
      <ExternalLogo class="asset-icon" :name="assetData.icon" :width="42" />
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

        <div v-else-if="!showWarning" class="count-assets overflow" data-testid="countAssets">
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

      <Switcher v-if="showAssetsManagementForm" :value="currencyVisible" @change="toggleCurrencyVisible" />

      <template v-else-if="!showWarning">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="assets.sendButtonText"
          target=".send"
          data-testid="sendBtn"
          @click="onRoute('send')"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="assets.receiveButtonText"
          target=".receive"
          data-testid="receiveBtn"
          @click="onRoute('receive')"
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
  </Lazy>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { APIItemState, NETWORK_STATUS } from '@extension-base//api/types/networks';
import type { CustomEvent } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import {
  filterBalanceItemsByNetwork,
  getSummaryTransferableBalanceFilteredByActiveNetworks,
} from '@/helpers/currencies';
import { isNetworkGroup } from '@/helpers/common';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class CurrencyItem extends Vue {
  readonly countDisplayedNetworks = 5;
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop({ type: Object, required: true }) assetData!: TokenGroup;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop({ required: false }) timeoutCallback!: (fn: () => void) => VoidFunction;

  get networkJson() {
    return this.networksStore.getNetwork(this.selectedNetwork);
  }

  get filteredBalances() {
    return this.assetData.balances.filter(({ state, name }) => {
      if (this.accountsStore.selectedWallet.isMobile) {
        const accounts = this.accountsStore.accounts;
        const account = accounts.find(({ address }) => address === this.accountsStore.selectedWallet.address);
        const network = this.networksStore.getNetwork(name);

        if (account && account.chains) {
          return account.chains.some((halfChainId) => {
            if (network && network.chainId)
              return network.chainId.includes(halfChainId) && state === APIItemState.READY;

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
    if (this.isCurrentNetwork) {
      const network = this.networksStore.getNetwork(this.selectedNetwork);

      return network?.name;
    }

    const activeNetworks = this.assetData.balances.filter(({ name }) => this.networksStore.getNetwork(name).active);

    if (this.assetData.relayChain === 'ethereum') {
      const network = this.networksStore.getNetwork(activeNetworks[0].name);

      return network.name;
    }

    if (
      BaseApi.isEthereumNetwork(this.assetData.mainNetwork) &&
      this.accountsStore.selectedWallet.ethereumAddress === ''
    ) {
      const networkWithTokens = activeNetworks.find(({ transferable }) => transferable && transferable !== '0')?.name;
      const network = this.networksStore.getNetwork(networkWithTokens ?? this.assetData.balances[0].name);

      return network.name;
    }

    const network = this.networksStore.getNetwork(this.assetData.mainNetwork);

    return network.name;
  }

  get groupId() {
    return this.assetData.groupId;
  }

  get tokenPrice() {
    return this.networksStore.getAssetPrice(this.assetData.priceId ?? '');
  }

  get currencyVisible(): boolean {
    return !this.accountsStore.hiddenAssets.includes(this.assetData.groupId);
  }

  get showCurrencyItem() {
    return this.showAssetsManagementForm || this.currencyVisible;
  }

  get networkBadges() {
    if (this.isCurrentNetwork) {
      const network = this.assetData.balances.find((balance) => {
        const account = this.accountsStore.accounts.find(
          ({ address }) => address === this.accountsStore.selectedWallet.address
        );
        const network = this.networksStore.getNetwork(balance.name);

        if (account && account.chains) {
          if (!account.chains.some((el) => network.chainId.includes(el))) return false;
        }

        return filterBalanceItemsByNetwork(balance, this.selectedNetwork);
      });

      if (network) {
        const { icon, name } = network;

        return [{ icon, name }];
      }

      return [];
    }

    if (this.isAdditional) return this.filteredBalances.splice(0, this.countDisplayedNetworks - 1);

    return this.filteredBalances;
  }

  get allNetworkBadges() {
    return this.assetData.balances;
  }

  get showShimmers() {
    if (this.showWarning) return false;

    // Hide shimmer if balances are loaded for at least one network
    return !this.assetData.balances.some(({ state }) => state === APIItemState.READY);
  }

  get showWarning() {
    if (!isNetworkGroup(this.selectedNetwork)) return this.networkJson?.networkStatus === NETWORK_STATUS.DISCONNECTED;

    // If all networks for tokens is DISCONNECTED, show error
    const allNetworksDisconnected = this.assetData.balances.every(({ name }) => {
      const network = this.networksStore.getNetwork(name);

      return network?.networkStatus === NETWORK_STATUS.DISCONNECTED;
    });

    if (allNetworksDisconnected) return true;

    return (
      this.assetData.balances.some((el) => el.state === APIItemState.ERROR && el.name === this.selectedNetwork) ||
      this.assetData.balances.every((el) => el.state === APIItemState.ERROR)
    );
  }

  get assetPrice() {
    return `${this.accountsStore.fiatSymbol}${this.$n(this.tokenPrice.price, 'price')}`;
  }

  get transferableFiatBalanceValue() {
    return `${this.accountsStore.fiatSymbol}${this.$n(this.transferableFiatBalance, 'price')}`;
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
    if (this.isCurrentNetwork) return this.selectedNetwork;

    const netName = this.activeNetworks[0].name;
    const network = this.networksStore.getNetwork(netName);

    return network.name;
  }

  get activeNetworks() {
    return this.assetData.balances
      .filter(({ name }) => {
        const { rank, favorite, active } = this.networksStore.getNetwork(name);

        if (this.selectedNetwork === POPULAR_NETWORKS) return rank !== undefined;

        if (this.selectedNetwork === FAVORITE_NETWORKS)
          return favorite.some((address) => address === this.accountsStore.selectedWallet.address);

        return active;
      })
      .filter(({ state }) => state === APIItemState.READY);
  }

  toggleCurrencyVisible(value: boolean) {
    this.accountsStore.setHiddenAssets({ groupId: this.assetData.groupId, value: value });
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

    if (this.isCurrentNetwork || this.activeNetworks.length === 1)
      this.$router.push({
        name: Components.AssetHistory,
        params: {
          assetId: this.groupId,
          selectedNetwork: this.redirectNetwork,
        },
      });
    else
      this.$router.push({
        name: Components.AssetNetworks,
        params: {
          assetId: this.groupId,
        },
      });
  }

  onRoute(form: 'send' | 'receive') {
    this.$router.push({
      name: form === 'send' ? Components.SendForm : Components.ReceiveForm,
      params: {
        assetId: this.groupId ?? '',
        network: this.mainNetwork ?? '',
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
      font-size: 0.75em;
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
        font-size: 1.25em;
        text-transform: uppercase;
        max-width: 220px;
      }

      .count-assets {
        max-width: 200px;
        font-size: 1.125em;
        margin: auto 0;
      }
    }

    .third-row {
      display: flex;
      font-size: 0.75em;
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
    font-size: 1.25em;
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
