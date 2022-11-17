<template>
  <div v-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText) }}</div>

  <Draggable v-else v-model="filteredCurrencies" handle=".handle">
    <CurrencyItem
      v-for="currency in filteredCurrencies"
      :key="currency.assetId"
      :currency="currency"
      :selectedNetwork="selectedNetwork"
      :showAssetsManagementForm="showAssetsManagementForm"
      :toggleVisibleActivityForm="toggleVisibleActivityForm"
    />
  </Draggable>
</template>

<script lang="ts">
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import CurrencyItem from './CurrencyItem.vue';
import type { SelectedWallet } from '@/store/accounts/types';
import type { SetCurrenciesProps } from '@/store/networks/types';
import type { TMutation } from '@/interfaces/common';
import type { Currency } from '@/interfaces/currencies';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    Draggable,
    CurrencyItem,
  },
})
export default class Currencies extends Vue {
  @Prop(Array) currencies!: Currency[];
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get mainText() {
    return this.isOnline ? 'wallet.allAssetsHidden' : 'common.offlineStatus';
  }

  get showAllAssetsHiddenText() {
    const visibleCurrencies = this.currencies.filter((currency) =>
      currency.getCurrencyVisible(this.selectedWallet.address)
    );

    return visibleCurrencies.length === 0 && !this.showAssetsManagementForm;
  }

  get filteredCurrencies() {
    return this.currencies;
  }

  set filteredCurrencies(currencies) {
    this.setCurrencies({ currencies, address: this.selectedWallet.address });
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
