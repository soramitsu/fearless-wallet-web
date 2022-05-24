<template>
  <div v-if="showCurrencyItem" class="currency-item">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <s-icon name="basic-menu-24" />
    </div>

    <div class="img-container">
      <img :src="getImg(currencyInfo.mainNetwork)" class="main-network-img" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div>
          {{ upperNetworkName }}
        </div>

        <div class="available-networks">
          <img
            v-for="{ network } in availableInNetworks"
            :key="network"
            :src="getImg(network)"
            class="mini-network-img"
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

          <div class="currency-up-price">+{{ currencyInfo.grownPercent }}%</div>
        </div>

        {{ totalBalanceString }}
      </div>
    </div>
    <div class="activity-block">
      <template v-if="!showAssetsManagementForm">
        <CircleButton
          iconName="send-gray"
          backgroundColor="black"
          class="button"
          @click="toggleVisibleActivityForm('showSendForm', true, currency)"
        />

        <CircleButton
          iconName="receive-grey"
          backgroundColor="black"
          class="button"
          @click="toggleVisibleActivityForm('showReceiveForm', true, currency)"
        />

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          :backgroundColorHover="true"
          @click="openTokenPage"
        />
      </template>

      <Switcher v-if="showAssetsManagementForm" v-model="currencyVisible" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { Currency } from '@/interfaces/currencies';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';
import Switcher from '@/components/Switcher.vue';
import CurrencyController from '@/controllers/currencyController';

@Component({
  components: {
    CircleButton,
    Switcher,
  },
})
export default class CurrencyItem extends Vue {
  localCurrencyVisible = false;

  @Prop(Object) currency!: Currency;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Boolean) hideZeroBalance!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  get showCurrencyItem() {
    return !this.showAssetsManagementForm ? this.currencyVisible : true;
  }

  get currencyController() {
    return new CurrencyController(this.currency);
  }

  get currencyVisible() {
    return this.localCurrencyVisible;
  }

  set currencyVisible(value: boolean) {
    this.currencyController.setCurrencyVisible(value);
    this.localCurrencyVisible = value;
  }

  get currencyInfo() {
    return this.currencyController.getCurrencyInfo();
  }

  get tokenString() {
    return this.currencyInfo?.token.toUpperCase();
  }

  get countTokensString() {
    return this.currencyInfo?.totalCountTokens.toFixed(4);
  }

  get totalBalanceString() {
    return `$${this.currencyInfo?.totalBalance.toFixed(2)}`;
  }

  get priceString() {
    return `$${this.currencyInfo.price}`;
  }

  get upperNetworkName() {
    return this.currencyInfo.mainNetwork.toUpperCase();
  }

  get isAdditional() {
    return this.currencyInfo.availableInNetworks.length > 5;
  }

  get additionalCount() {
    return this.currencyInfo.availableInNetworks.length - 4;
  }

  get availableInNetworks() {
    return [...this.currencyInfo.availableInNetworks].splice(0, this.isAdditional ? 4 : 5);
  }

  mounted() {
    this.localCurrencyVisible = this.currencyController.getCurrencyVisible();
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
    this.$router.push({
      name: Components.Token,
      params: {
        token: this.currencyInfo.token,
        network: this.currencyInfo.mainNetwork,
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
    display: flex;
    flex-direction: column;
    justify-content: space-between;
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
      color: rgba(255, 255, 255, 0.75);
    }

    .currency-up-price {
      margin-left: 2px;
      color: rgba(126, 222, 155, 0.75);
    }
  }

  .second-row-left {
    font-size: 20px;
  }

  .activity-block {
    display: flex;
    align-items: center;
    margin-left: 16px;
  }

  .button {
    margin-right: 7px;
  }

  .img-container {
    width: 60px;
    margin: auto;

    .main-network-img {
      width: 32px;
      margin-right: 13px;
    }
  }

  .mini-network-img {
    width: 12px;
    margin-right: 3px;
    opacity: 0.5;
  }
}
</style>
