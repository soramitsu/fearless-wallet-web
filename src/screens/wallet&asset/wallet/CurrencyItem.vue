<template>
  <div v-if="showCurrencyItem" class="currency-item" @click="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>

    <div class="img-container">
      <NetworkLogo
        class="main-network-img"
        :name="currency.displayName"
        :relayChain="currency.relayChain"
        :width="32"
      />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>
          {{ upperNetworkName }}
        </div>

        <template v-if="!isCurrentNetwork">
          <Shimmer v-if="showShimmers" height="14px" width="60px" />

          <div v-else class="available-networks">
            <NetworkLogo
              v-for="{ network } in availableInNetworksPart"
              class="minor-network-img"
              :key="network"
              :name="network"
              :width="12"
            />

            <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
          </div>
        </template>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow">
          {{ assetString }}
        </div>

        <Shimmer v-if="showShimmers" height="23px" width="60px" />

        <div v-else class="count-assets overflow">
          {{ countAssetsString }}
        </div>
      </div>
      <div class="row third-row">
        <div class="overflow row">
          {{ priceString }}

          <div :class="changePriceClasses">{{ usd24HoursChangeString }}</div>
        </div>

        <Shimmer v-if="showShimmers" height="14px" width="70px" />

        <div v-else>
          {{ totalBalanceString }}
        </div>
      </div>
    </div>
    <div class="activity">
      <template v-if="!showAssetsManagementForm">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="asset.sendButtonText"
          target=".send"
          @click="toggleVisibleActivityForm('showSendForm', true, currency)"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="asset.receiveButtonText"
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
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currency } from '@/interfaces/currencies';
import type { SelectedWallet } from '@/store/accounts/types';
import CircleButton from '@/components/CircleButton.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import Switcher from '@/components/Switcher.vue';
import Shimmer from '@/components/Shimmer.vue';
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GetNetworkStatus } from '@/store/networks/types';

@Component({
  components: {
    Shimmer,
    Switcher,
    NetworkLogo,
    CircleButton,
  },
})
export default class CurrencyItem extends Vue {
  readonly countDisplayedNetworks = 5;

  @Prop(Object) currency!: Currency;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getNetworkStatus) getNetworkStatus!: GetNetworkStatus;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;

  get showShimmers() {
    const index = this.currency.getAvailableInNetworks(this.selectedWallet).findIndex(({ network }) => {
      const status = this.getNetworkStatus(network);

      return status === 'pending';
    });

    return !this.isOnline || index !== -1;
  }

  get isCurrentNetwork() {
    return this.selectedNetwork !== 'all';
  }

  get currencyVisible() {
    return this.currency.getCurrencyVisible(this.selectedWallet.address);
  }

  set currencyVisible(value: boolean) {
    this.currency.setCurrencyVisible(this.selectedWallet.address, value);
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
    const change = +formattedNumber(hours24Change, { returnOriginNumber: false });

    return change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '';
  }

  get assetString() {
    return this.currency?.displayName.toUpperCase();
  }

  get countAssetsString() {
    const totalCountAssets = +this.currency.getTotalCountAssets(this.selectedWallet, this.selectedNetwork);

    return formattedNumber(totalCountAssets, {
      decimalsValue: 4,
      returnOriginNumber: false,
    });
  }

  get totalBalanceString() {
    const balance = +this.currency.getTotalBalance(this.selectedWallet, this.selectedNetwork);

    return `${this.fiatSymbol}${formattedPrice(balance)}`;
  }

  get priceString() {
    return `${this.fiatSymbol}${formattedPrice(this.currency.price)}`;
  }

  get upperNetworkName() {
    if (this.isCurrentNetwork) return this.selectedNetwork.toUpperCase();

    return this.currency.mainNetwork.toUpperCase() ?? '';
  }

  get availableInNetworks() {
    // return this.currency.getAvailableInNetworks(this.selectedWallet); // Please don't delete. Needed for development.

    return this.currency.getAvailableInNetworks(this.selectedWallet).filter(({ balance: { total } }) => total !== '0');
  }

  get isAdditional() {
    return this.availableInNetworks.length > this.countDisplayedNetworks;
  }

  get additionalCount() {
    return this.availableInNetworks.length - (this.countDisplayedNetworks - 1);
  }

  get availableInNetworksPart() {
    if (this.isCurrentNetwork) return [{ network: this.selectedNetwork }];

    if (this.isAdditional) return [...this.availableInNetworks].splice(0, this.countDisplayedNetworks - 1);

    return this.availableInNetworks;
  }

  openAssetPage(event: Event) {
    const classList = (event.target as HTMLDivElement)?.classList;

    if (
      this.showAssetsManagementForm ||
      classList.contains('button') ||
      classList.contains('send-white') ||
      classList.contains('receive-white')
    )
      return;

    const { mainNetwork, assetId } = this.currency;
    const [availableInNetworks] = this.currency.getAvailableInNetworks(this.selectedWallet);
    const availableNetwork = availableInNetworks?.network ?? '';
    const network = this.isCurrentNetwork
      ? this.selectedNetwork
      : mainNetwork !== ''
      ? mainNetwork
      : availableNetwork !== ''
      ? availableNetwork
      : 'polkadot';

    this.$router.push({
      name: Components.Asset,
      params: {
        assetId,
        network,
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
      }

      .count-assets {
        font-size: 18px;
        margin: auto 0;
      }
    }

    .third-row {
      display: flex;
      font-size: 12px;
      color: $default-white;
      height: 14px;

      .price-change {
        margin-left: 2px;
      }

      .up-price {
        color: rgba(126, 222, 155, 0.75);
      }

      .down-price {
        color: #d0021b;
      }
    }
  }

  .overflow {
    max-width: 150px;
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

  .img-container {
    margin: auto;
    user-select: none;

    .main-network-img {
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
