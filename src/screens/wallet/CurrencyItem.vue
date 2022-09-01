<template>
  <div v-if="showCurrencyItem" class="currency-item">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <s-icon name="basic-menu-24" class="handle" />
    </div>

    <div class="img-container">
      <img :src="getImg(currency.mainNetwork)" class="main-network-img" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>
          {{ upperNetworkName }}
        </div>

        <div class="available-networks">
          <img
            v-for="{ network } in availableInNetworksPart"
            :key="network"
            :src="getImg(network)"
            class="minor-network-img"
          />

          <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
        </div>
      </div>
      <div class="row second-row">
        <div class="currency-name">
          {{ tokenString }}
        </div>
        <div class="count-tokens">
          {{ countTokensString }}
        </div>
      </div>
      <div class="row third-row">
        <div class="row">
          {{ priceString }}

          <div :class="changePriceClasses">{{ usd24HoursChangeString }}</div>
        </div>

        {{ totalBalanceString }}
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

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          backgroundColorHover="black"
          @click="openTokenPage"
        />
      </template>

      <Switcher v-else v-model="currencyVisible" />
    </div>
  </div>
</template>

<script lang="ts">
import CircleButton from '@/components/CircleButton.vue';
import Switcher from '@/components/Switcher.vue';
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/util/numbers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import type { Currency } from '@/interfaces/currencies';
import type { SelectedWallet } from '@/store/accounts/types';

@Component({
  components: {
    CircleButton,
    Switcher,
  },
})
export default class CurrencyItem extends Vue {
  currencyVisible = true;

  @Prop(Object) currency!: Currency;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get showCurrencyItem() {
    return !this.showAssetsManagementForm ? this.currencyVisible : true;
  }

  get changePriceClasses() {
    const { hours24Change } = this.currency;
    const classes = ['price'];

    if (hours24Change > 0) classes.push('up-price');
    else if (hours24Change < 0) classes.push('down-price');

    return classes;
  }

  get usd24HoursChangeString() {
    const { hours24Change } = this.currency;
    const change = +formattedNumber(hours24Change);

    return change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '';
  }

  get tokenString() {
    return this.currency?.token.toUpperCase();
  }

  get countTokensString() {
    const totalCountTokens =
      this.selectedNetwork !== 'All networks'
        ? +this.currency.getTotalCountTokensByNetwork(this.selectedWallet, this.selectedNetwork)
        : +this.currency.getTotalCountTokens(this.selectedWallet);

    return formattedNumber(totalCountTokens, 4);
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
    return this.currency.mainNetwork.toUpperCase();
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

  @Watch('currencyVisible')
  toggleCurrencyVisible(value: boolean) {
    this.currency.setCurrencyVisible(value);

    this.$nextTick(() => this.$emit('toggleHideZeroBalance'));
  }

  mounted() {
    this.currencyVisible = this.currency.getCurrencyVisible();
  }

  getImg(network: string) {
    if (network === '') return '';

    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }

  send() {
    alert('send');
  }

  receive() {
    alert('Receive');
  }

  openTokenPage() {
    const { token, mainNetwork } = this.currency;
    const network = this.selectedNetwork !== 'All networks' ? this.selectedNetwork : mainNetwork;

    this.$router.push({
      name: Components.Token,
      params: {
        token,
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-right: 16px;

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
      color: rgba(255, 255, 255, 0.5);
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

      .count-tokens {
        font-size: 18px;
      }
    }

    .third-row {
      display: flex;
      font-size: 12px;
      color: $default-white;
    }

    .price {
      margin-left: 2px;
    }

    .up-price {
      color: rgba(126, 222, 155, 0.75);
    }

    .down-price {
      color: #d0021b;
    }
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
      width: 32px;
      margin-right: 13px;
    }
  }

  .minor-network-img {
    width: 12px;
    margin-right: 3px;
    opacity: 0.5;
    user-select: none;

    &:last-child {
      margin-right: 0;
    }
  }
}
</style>
