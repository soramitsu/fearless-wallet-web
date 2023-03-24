<template>
  <Lazy
    v-if="showCurrencyItem"
    :timeoutCallback="timeoutCallback"
    :class="currencyClasses"
    @click.native="openAssetPage"
  >
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>

    <div class="img-container">
      <ExternalLogo class="main-network-img" :name="currency.assetId" :width="42" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>
          {{ assetFullName }}
        </div>

        <template v-if="!isCurrentNetwork">
          <Shimmer v-if="showShimmers" height="14px" width="60px" />

          <template v-else-if="!showWarning">
            <div class="available-networks">
              <ExternalLogo
                v-for="{ network } in availableInNetworksPart"
                class="minor-network-img"
                :key="network"
                :name="network"
                :width="12"
              />

              <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
            </div>
          </template>
        </template>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow">
          {{ assetString }}
        </div>

        <Shimmer v-if="showShimmers" height="23px" width="60px" />

        <div v-else-if="!showWarning" class="count-assets overflow">
          {{ transferableCountAssetString }}
        </div>
      </div>
      <div class="row third-row">
        <div class="price row">
          {{ priceString }}

          <div :class="changePriceClasses">{{ usd24HoursChangeString }}</div>
        </div>

        <Shimmer v-if="showShimmers" height="14px" width="70px" />

        <div v-else-if="!showWarning" class="total-balance overflow">
          {{ transferableFiatBalanceString }}
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
          @click="toggleVisibleActivityForm('showSendForm', true, currency)"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="assets.receiveButtonText"
          target=".receive"
          @click="toggleVisibleActivityForm('showReceiveForm', true, currency)"
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
  </Lazy>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currency } from '@/interfaces/currencies';
import type { SelectedWallet } from '@/store';
import type { CustomEvent } from '@/interfaces';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GetNetworkStatus } from '@/store';
import { NetworksController } from '@/controllers';

@Component
export default class CurrencyItem extends Vue {
  readonly countDisplayedNetworks = 5;

  @Prop(Object) currency!: Currency;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Prop({ required: false }) timeoutCallback!: (fn: () => void) => VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getNetworkStatus) getNetworkStatus!: GetNetworkStatus;

  get currencyClasses() {
    return [
      'currency-item',
      {
        'currency-item-management': this.showAssetsManagementForm,
      },
    ];
  }

  get showShimmers() {
    if (this.isCurrentNetwork) return !this.isOnline || this.getNetworkStatus(this.selectedNetwork) === 'pending';

    const index = this.currency.getNetworkList().findIndex(({ network }) => {
      const status = this.getNetworkStatus(network);

      return status === 'pending';
    });

    return !this.isOnline || index !== -1;
  }

  get showWarning() {
    if (this.showAssetsManagementForm) return false;

    if (this.isCurrentNetwork) {
      const status = this.getNetworkStatus(this.selectedNetwork);
      const isZeroBalanceNetwork = NetworksController.isZeroBalanceNetwork(this.selectedWallet, this.selectedNetwork);

      return isZeroBalanceNetwork ? status === 'disconnected' : false;
    }

    return this.currency.getNetworkList().every(({ network }) => {
      const status = this.getNetworkStatus(network);
      const isZeroBalanceNetwork = NetworksController.isZeroBalanceNetwork(this.selectedWallet, network);

      return isZeroBalanceNetwork ? status === 'disconnected' : false;
    });
  }

  get isCurrentNetwork() {
    return this.selectedNetwork !== 'all';
  }

  get currencyVisible() {
    return this.currency.getCurrencyVisibility(this.selectedWallet.address);
  }

  set currencyVisible(value: boolean) {
    this.currency.setCurrencyVisibility(this.selectedWallet.address, value);
  }

  get showCurrencyItem() {
    return this.showAssetsManagementForm || this.currencyVisible;
  }

  get changePriceClasses() {
    const { hours24Change } = this.currency;
    const classes = ['price-change'];

    if (hours24Change > 0) classes.push('up-price');
    else if (hours24Change < 0) classes.push('down-price');

    return classes;
  }

  get usd24HoursChangeString() {
    const { hours24Change } = this.currency;

    return hours24Change !== 0 ? `${hours24Change > 0 ? '+' : ''}${this.$n(hours24Change / 100, 'percent')}` : '';
  }

  get assetString() {
    return this.currency?.displayName.toUpperCase();
  }

  get transferableCountAssetString() {
    const totalCountAssets = +this.currency.getTransferableCountAssets(this.selectedWallet, this.selectedNetwork);

    return this.$n(totalCountAssets, 'decimal');
  }

  get transferableFiatBalanceString() {
    const balance = +this.currency.getTransferableFiatBalance(this.selectedWallet, this.selectedNetwork);

    return `${this.fiatSymbol}${this.$n(balance, 'price')}`;
  }

  get priceString() {
    return `${this.fiatSymbol}${this.$n(this.currency.price, 'price')}`;
  }

  get assetFullName() {
    return this.currency.assetFullName.toUpperCase() ?? '';
  }

  get walletBalance() {
    return this.currency.getNetworksWithBalance(this.selectedWallet);
  }

  get isAdditional() {
    return this.walletBalance.length > this.countDisplayedNetworks;
  }

  get additionalCount() {
    return this.walletBalance.length - (this.countDisplayedNetworks - 1);
  }

  get availableInNetworksPart() {
    if (this.isCurrentNetwork) return [{ network: this.selectedNetwork }];

    if (this.isAdditional) return [...this.walletBalance].splice(0, this.countDisplayedNetworks - 1);

    return this.walletBalance;
  }

  get redirectNetwork() {
    const { mainNetwork } = this.currency;
    const [{ network: firstNetwork }] = this.currency.getNetworkList();

    return this.isCurrentNetwork ? this.selectedNetwork : mainNetwork !== '' ? mainNetwork : firstNetwork;
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

    const { assetId } = this.currency;

    this.$router.push({
      name: Components.Asset,
      params: {
        assetId,
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
  border-bottom: 1px solid $default-background-color;
  margin-right: 16px;
  align-items: center;
  height: 80px;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  .drag-icon {
    margin: auto 20px auto 0;
    cursor: pointer;

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
        cursor: pointer;
      }
    }

    .second-row {
      font-weight: 700;
      margin-bottom: 5px;

      .currency-name {
        font-size: 20px;
        max-width: 100px;
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

      .up-price {
        color: rgba(126, 222, 155, 0.75);
      }

      .down-price {
        color: #d0021b;
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
    min-width: 45px;
    user-select: none;
    margin-right: 12px;

    .main-network-img {
      width: 42px;
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

.currency-item-management {
  cursor: default;
}
</style>
