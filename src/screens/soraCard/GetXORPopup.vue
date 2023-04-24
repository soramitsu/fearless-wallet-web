<template>
  <Popup headerText="soraCard.getXOR" sizeWidth="big" :showBorder="true" :handlerClose="handlerClose">
    <div class="content">
      <div>{{ $t('soraCard.getXORLabel') }}</div>

      <Button v-if="isExtension" width="100%" text="soraCard.buyXORWithEUR" class="button" @click="buyXORwithEUR" />

      <Button width="100%" text="soraCard.swapXOR" class="button" @click="openSoraSwap" />

      <BorderButton width="100%" text="common.cancel" class="button" @click="handlerClose" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currencies } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { Components } from '@/router/routes';
import { SORA_NETWORK_NAME } from '@/consts/networks';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getXORCurrency } from '@/helpers/currencies';
import { IS_EXTENSION } from '@/consts/global';

@Component
export default class GetXORPopup extends Vue {
  readonly isExtension = IS_EXTENSION;

  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get selectedNetwork() {
    return SORA_NETWORK_NAME as string;
  }

  get currencyXOR() {
    return getXORCurrency(this.currencies);
  }

  get restPriceXOR() {
    return this.currencyXOR?.calculateXorRestPrice(this.selectedWallet).euroToPayInXor;
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
