<template>
  <div headerText="soraCard.buyXORWithEUR" class="x1-dialog">
    <Loader v-if="loadingX1" />

    <div v-else-if="isTestnet" class="testnet-1x-disclaimer">
      <Icon icon="info-triangle" className="triangle" />

      <div>
        <p class="disclaimer__text">DO NOT ENTER YOUR REAL CARD NUMBER. This is a test environment.</p>
        <p class="disclaimer__text">Please, use the following card details:</p>

        <ul>
          <li>Card number: 4012 0000 0006 0085</li>
          <li>Card CVV: 123</li>
          <li>Card expiration date: Input any date</li>
          <li>Card owner name: Input any name & surname</li>
        </ul>
      </div>
    </div>

    <div :class="scrollClasses">
      <Scroll v-show="!loadingX1">
        <div class="wrapper">
          <div
            :id="widgetId"
            data-from-currency="EUR"
            :data-address="accountAddress"
            :data-from-amount="restEuroToDeposit"
            :data-hide-buy-more-button="true"
            :data-hide-try-again-button="false"
            data-locale="en"
          ></div>
        </div>
      </Scroll>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { loadScript, unloadScript } from 'vue-plugin-load-script';
import { Getter } from 'vuex-class';
import { type FPNumber } from '@sora-substrate/util';
import type { SelectedWallet } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { X1Api } from '@/util/x1';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { calculateXOREuroBalance } from '@/util/soraCard';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME, SORA_TEST } from '@/consts/sora';

@Component({})
export default class X1Form extends Vue {
  X1Widget = X1Api.getWidget();
  loadingX1 = true;

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(SoraCardGettersTypes.xorPerEuroRatio) xorPerEuroRatio!: FPNumber;

  get scrollClasses() {
    return [
      {
        'scroll-collapse': this.loadingX1,
        scroll: !this.loadingX1,
      },
    ];
  }

  get accountAddress() {
    return BaseApi.formatAddress(this.selectedWallet, SORA_NETWORK_NAME);
  }

  get currencyXOR() {
    return getXORCurrency(this.balances);
  }

  get euroBalanceXOR() {
    return calculateXOREuroBalance(this.currencyXOR, this.xorPerEuroRatio) ?? 0;
  }

  get restEuroToDeposit() {
    return 100 - parseInt(this.euroBalanceXOR.toString(), 10);
  }

  get widgetId() {
    return this.X1Widget.widgetId;
  }

  get isTestnet() {
    return SORA_NETWORK_NAME === SORA_TEST;
  }

  async mounted() {
    this.loadX1();
  }

  beforeDestroy() {
    this.unloadX1();
  }

  loadX1() {
    loadScript(this.X1Widget.sdkUrl)
      .then(() => setTimeout(() => (this.loadingX1 = false), 1500))
      .catch((error) => console.error(error));
  }

  unloadX1() {
    unloadScript(this.X1Widget.sdkUrl).catch(() => null);
  }
}
</script>

<style lang="scss">
.x1-dialog .el-dialog .wrapper {
  min-height: 320px;
  padding: 20px;
  margin: -10px -20px -20px;
  height: 450px;
}

.testnet-1x-disclaimer {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 28px;
  background-color: $default-background-color;
  padding: $default-padding;
  margin-bottom: 10px;
  text-align: left;
  font-size: 0.875em;

  .triangle {
    width: 50px;
    height: 50px;
    margin-bottom: 10px;
  }

  ul {
    padding: $default-padding;
  }
}
</style>

<style lang="scss" scoped>
.x1-dialog {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;

  .scroll {
    height: 675px;
  }

  .scroll-collapse {
    height: 0;
  }
}
</style>
