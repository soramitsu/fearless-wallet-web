<template>
  <Scroll>
    <div v-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText) }}</div>

    <Draggable v-else v-model="filteredBalances" handle=".handle" :key="selectedWallet.address">
      <CurrencyItemStateLess
        v-for="(asset, assetKey) in filteredBalances"
        :assetData="asset"
        :price="getAssetPrice(asset.priceId)"
        :priceChange="getPriceChange(asset.priceId)"
        :key="assetKey"
        :selectedNetwork="selectedNetwork"
        :showAssetsManagementForm="showAssetsManagementForm"
        :toggleVisibleActivityForm="toggleVisibleActivityForm"
        @toggleNetworkManagementVisible="$emit('toggleNetworkManagementVisible')"
      />
    </Draggable>
  </Scroll>
</template>

<script lang="ts">
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import type { SelectedWallet, SetCurrenciesProps } from '@/store';
import type { TMutation } from '@/interfaces/common';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import CurrencyItemStateLess from '@/screens/wallet&asset/wallet/CurrencyItemStateLess.vue';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsPrice } from '@/interfaces';

@Component({
  components: {
    Draggable,
    CurrencyItemStateLess,
  },
})
export default class Currencies extends Vue {
  @Prop(Array) balances!: TokenBalance[];
  @Prop(String) selectedNetwork!: string;
  @Prop(String) filterValue!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(NetworksGettersTypes.getPrice) prices!: AssetsPrice;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get mainText() {
    if (!this.isOnline) return 'common.offlineStatus';

    return this.filterValue !== '' ? 'wallet.nothingFound' : 'wallet.allAssetsHidden';
  }

  get showAllAssetsHiddenText() {
    return this.balances.length === 0 && !this.showAssetsManagementForm;
  }

  get filteredBalances() {
    return this.balances;
  }

  set filteredBalances(balances) {
    this.$emit('setCustomSort');
    this.setCurrencies({
      currencies: balances, //FIX
      address: this.selectedWallet.address,
      network: this.selectedNetwork,
    });
  }

  getAssetPrice(assetKey: string) {
    if (Object.keys(this.prices).length && this.prices.tokenPriceMap[assetKey])
      return this.prices.tokenPriceMap[assetKey];

    return 0;
  }

  getPriceChange(assetKey: string) {
    if (this.prices === undefined || this.prices.tokenPriceChange === undefined || assetKey === undefined) return 0;

    if (this.prices.tokenPriceChange[assetKey]) return this.prices.tokenPriceChange[assetKey] / 100;

    return 0;
  }
}
</script>

<style lang="scss" scoped>
.info-text {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: -16px;
}
</style>
