<template>
  <Popup headerText="soraCard.getXOR" sizeWidth="big" :showBorder="true" @handlerClose="$emit('handlerClose')">
    <div class="content">
      <div>{{ $t('soraCard.getXORLabel') }}</div>

      <FButton v-if="!isExtension" width="100%" text="soraCard.buyXORWithEUR" class="button" @click="buyXORwithEUR" />

      <FButton width="100%" text="soraCard.swapXOR" class="button" @click="openSoraSwap" />

      <BorderButton width="100%" text="common.cancel" class="button" @click="$emit('handlerClose')" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { type FPNumber } from '@sora-substrate/util';
import { Components } from '@/router/routes';
import { IS_EXTENSION } from '@/consts/global';
import { calculateXorRestPrice } from '@/util/soraCard';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { useAccountsStore } from '@/stores/accounts';
import { useSoraCardStore } from '@/stores/soraCard';

@Component
export default class GetXORPopup extends Vue {
  readonly soraNetworkName = SORA_NETWORK_NAME;
  readonly isExtension = IS_EXTENSION;

  accountsStore = useAccountsStore();
  soraCardStore = useSoraCardStore();

  get currencyXOR() {
    return getXORCurrency(this.accountsStore.balances);
  }

  get restPriceXOR() {
    return calculateXorRestPrice(this.currencyXOR, this.soraCardStore.xorPerEuroRatio as FPNumber).euroToPayInXor;
  }

  openSoraSwap() {
    this.$router.push({
      name: Components.SoraSwap,
      params: {
        restPriceXOR: this.restPriceXOR,
      },
    });
  }

  buyXORwithEUR() {
    this.$emit('openX1Form');
  }
}
</script>

<style scoped lang="scss">
.content {
  padding: 5px 16px 0px;
  color: $gray-color;
  .proceed-button {
    margin: 20px 0 10px;
  }
  .button {
    margin-top: 10px;
  }
}
</style>
