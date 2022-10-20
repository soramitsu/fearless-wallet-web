<template>
  <div v-if="showCurrencyItem" class="currency-item" @click="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <s-icon name="basic-menu-24" class="handle" />
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

        <div class="available-networks">
          <NetworkLogo
            v-for="{ network } in availableInNetworksPart"
            class="minor-network-img"
            :key="network"
            :name="network"
            :width="12"
          />

          <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
        </div>
      </div>
      <div class="row second-row">
        <div class="currency-name overflow">
          {{ assetString }}
        </div>
        <div class="count-assets overflow">
          {{ countAssetsString }}
        </div>
      </div>
      <div class="row third-row">
        <div class="overflow row">
          {{ priceString }}

          <div :class="changePriceClasses">{{ usd24HoursChangeString }}</div>
        </div>

        <div>
          {{ totalBalanceString }}
        </div>
      </div>
    </div>
    <div class="activity">
      <template v-if="!showAssetsManagementForm">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button"
          @click="toggleVisibleActivityForm('showSendForm', true, currency)"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button"
          @click="toggleVisibleActivityForm('showReceiveForm', true, currency)"
        />

        <CircleButton iconName="chevron-right" backgroundColor="none" backgroundColorHover="black" />
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
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    CircleButton,
    Switcher,
    NetworkLogo,
  },
})
export default class CurrencyItem extends Vue {
  @Prop(Object) currency!: Currency;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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
    const change = +formattedNumber(hours24Change);

    return change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '';
  }

  get assetString() {
    return this.currency?.displayName.toUpperCase();
  }

  get countAssetsString() {
    const totalCountAssets =
      this.selectedNetwork !== 'All networks'
        ? +this.currency.getTotalCountAssetsByNetwork(this.selectedWallet, this.selectedNetwork)
        : +this.currency.getTotalCountAssets(this.selectedWallet);

    return formattedNumber(totalCountAssets, 4, false);
  }

  get totalBalanceString() {
    const balance =
      this.selectedNetwork !== 'All networks'
        ? +this.currency.getBalanceInNetwork(this.selectedWallet, this.selectedNetwork)
        : +this.currency.getTotalBalance(this.selectedWallet);

    return `${this.fiatSymbol}${formattedPrice(balance)}`;
  }

  get priceString() {
    return `${this.fiatSymbol}${formattedPrice(this.currency.price)}`;
  }

  get upperNetworkName() {
    return this.currency.mainNetwork.toUpperCase() ?? '';
  }

  get availableInNetworks() {
    return this.currency.getAvailableInNetworks(this.selectedWallet);
  }

  get isAdditional() {
    return this.availableInNetworks.length > 5;
  }

  get additionalCount() {
    return this.availableInNetworks.length - 4;
  }

  get availableInNetworksPart() {
    return this.selectedNetwork !== 'All networks'
      ? [{ network: this.selectedNetwork }]
      : [...this.availableInNetworks].splice(0, this.isAdditional ? 4 : 5);
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
    const availableInNetworks = this.currency.getAvailableInNetworks(this.selectedWallet);
    const availableNetwork = availableInNetworks[0]?.network ?? '';
    const network =
      this.selectedNetwork !== 'All networks'
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
  height: 78px;
  align-items: center;

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
      }
    }

    .third-row {
      display: flex;
      font-size: 12px;
      color: $default-white;

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
