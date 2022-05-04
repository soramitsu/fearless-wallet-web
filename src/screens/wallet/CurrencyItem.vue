<template>
  <div class="currency-item">
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
          {{ currency.token }}
        </div>
        <div class="count-tokens">
          {{ countTokensString }}
        </div>
      </div>
      <div class="row third-row">
        <div class="row">
          {{ priceString }}

          <div class="currency-up-price">+{{ currency.grownPercent }}%</div>
        </div>

        {{ totalBalanceString }}
      </div>
    </div>
    <div class="activity-block">
      <CircleButton
        iconType="send"
        backgroundColor="black"
        class="button"
        :handler="toggleVisibleActivityForm.bind(null, 'showSendForm')"
      />

      <CircleButton
        iconType="receive"
        backgroundColor="black"
        class="button"
        :handler="toggleVisibleActivityForm.bind(null, 'showReceiveForm')"
      />

      <CircleButton iconType="right" backgroundColor="none" :backgroundColorHover="true" :handler="right" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { Currency } from '@/interfaces/currencies';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: {
    CircleButton,
  },
})
export default class extends Vue {
  @Prop(Object) currency!: Currency;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  get countTokens() {
    return this.currency.availableInNetworks.reduce((sum, { balance }) => sum + balance, 0);
  }

  get countTokensString() {
    return this.countTokens.toFixed(4);
  }

  get totalBalance() {
    return this.currency.price * this.countTokens;
  }

  get totalBalanceString() {
    return `$${this.totalBalance.toFixed(2)}`;
  }

  get priceString() {
    return `$${this.currency.price}`;
  }

  get upperNetworkName() {
    return this.currency.mainNetwork.toUpperCase();
  }

  get isAdditional() {
    return this.currency.availableInNetworks.length > 5;
  }

  get additionalCount() {
    return this.currency.availableInNetworks.length - 4;
  }

  get availableInNetworks() {
    return [...this.currency.availableInNetworks].splice(0, this.isAdditional ? 4 : 5);
  }

  getImg(network: string) {
    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }

  send() {
    alert('send');
  }

  receive() {
    alert('Receive');
  }

  right() {
    this.$router.push({
      name: Components.Token,
      params: {
        token: this.currency.token,
        network: this.currency.mainNetwork,
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
