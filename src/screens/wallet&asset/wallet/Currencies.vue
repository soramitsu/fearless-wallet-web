<template>
  <Scroll>
    <div v-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText) }}</div>

    <VirtualDragList
      v-else
      :dataSource="filteredBalances"
      dataKey="assetId"
      handle=".handle"
      style="height: 387px"
      @drop="onDrop"
    >
      <template v-slot:item="{ record: asset, index }">
        <CurrencyItem
          :assetData="asset"
          :price="getAssetPrice(asset.priceId)"
          :priceChange="getPriceChange(asset.priceId)"
          :key="index"
          :selectedNetwork="selectedNetwork"
          :showAssetsManagementForm="showAssetsManagementForm"
          :toggleVisibleActivityForm="toggleVisibleActivityForm"
          :timeoutCallback="timeoutCallback"
          @toggleNetworkManagementVisible="$emit('toggleNetworkManagementVisible')"
        />
      </template>
    </VirtualDragList>
  </Scroll>
</template>

<script lang="ts">
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import VirtualDragList from 'vue-virtual-draglist';
import type { SelectedWallet } from '@/store';
import type { AsyncFn } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import { TokenBalance, BalanceJson } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsPrice } from '@/interfaces';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';

type TimeoutSubscription = {
  subscription: NodeJS.Timeout;
  fn: () => void;
};

@Component({
  components: {
    Draggable,
    CurrencyItem,
    VirtualDragList,
  },
})
export default class Currencies extends Vue {
  timeoutSubscriptions: TimeoutSubscription[] = [];

  @Prop(Array) balances!: TokenBalance[];
  @Prop(String) selectedNetwork!: string;
  @Prop(String) filterValue!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(NetworksGettersTypes.getPrice) prices!: AssetsPrice;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;

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

  onDrop(props: any) {
    this.setBalance({
      details: props.list,
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

  timeoutCallback(fn: () => void) {
    this.timeoutSubscriptions.forEach(({ subscription }) => clearTimeout(subscription));

    this.timeoutSubscriptions = [...this.timeoutSubscriptions, { fn }].map(({ fn }) => {
      const subscription = setTimeout(() => fn(), 300);

      return { subscription, fn };
    });
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
