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
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { IS_EXTENSION } from '@/consts/global';
import { calculateXorRestPrice } from '@/util/soraCard';
import { GettersTypes as SoraCardGettersTypes } from '@/store/soraCard/getters';
import { getXORCurrency } from '@/helpers/currencies';
import { SORA_NETWORK_NAME } from '@/consts/sora';

@Component
export default class GetXORPopup extends Vue {
  readonly soraNetworkName = SORA_NETWORK_NAME;
  readonly isExtension = IS_EXTENSION;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(SoraCardGettersTypes.xorPerEuroRatio) xorPerEuroRatio!: FPNumber;

  get currencyXOR() {
    return getXORCurrency(this.balances);
  }

  get restPriceXOR() {
    return calculateXorRestPrice(this.currencyXOR, this.xorPerEuroRatio).euroToPayInXor;
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
