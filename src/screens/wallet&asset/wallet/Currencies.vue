<template>
  <Scroll>
    <div v-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText) }}</div>

    <Draggable v-else v-model="filteredBalances" handle=".handle" :key="selectedWallet.address">
      <CurrencyItem
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
import { Getter, Action } from 'vuex-class';
import type { SelectedWallet } from '@/store';
import type { TAction } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import { TokenBalance, BalanceJson } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsPrice } from '@/interfaces';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';

@Component({
  components: {
    Draggable,
    CurrencyItem,
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
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: TAction<BalanceJson>;

  get mainText() {
    if (!this.isOnline) return 'common.offlineStatus';

    return this.filterValue !== '' ? 'wallet.nothingFound' : 'wallet.allAssetsHidden';
  }

  get showAllAssetsHiddenText() {
    if (this.showAssetsManagementForm) return false;

    const allHidden = this.balances.every(({ assetId }) => this.hiddenAssets.includes(assetId));

    return this.balances.length === this.hiddenAssets.length || allHidden || !this.isOnline;
  }

  get filteredBalances() {
    return this.balances;
  }

  set filteredBalances(balances) {
    this.setBalance({
      details: balances,
      reset: false,
      saveSequence: true,
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
