<template>
  <div v-if="showAllAssetsHiddenText" class="info-text">{{ $t(mainText) }}</div>

  <Draggable v-else v-model="filteredCurrencies" handle=".handle" :key="selectedWallet.address">
    <CurrencyItem
      v-for="currency in filteredCurrencies"
      :key="currency.assetId"
      :currency="currency"
      :selectedNetwork="selectedNetwork"
      :showAssetsManagementForm="showAssetsManagementForm"
      :toggleVisibleActivityForm="toggleVisibleActivityForm"
      :timeoutCallback="timeoutCallback"
      @toggleNetworkManagementVisible="$emit('toggleNetworkManagementVisible')"
    />
  </Draggable>
</template>

<script lang="ts">
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import CurrencyItem from './CurrencyItem.vue';
import type { SelectedWallet, SetCurrenciesProps } from '@/store';
import type { TMutation } from '@/interfaces/common';
import type { Currency } from '@/interfaces/currencies';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

type TimeoutSubscription = {
  subscription: NodeJS.Timeout;
  fn: () => void;
};

@Component({
  components: {
    Draggable,
    CurrencyItem,
  },
})
export default class Currencies extends Vue {
  timeoutSubscriptions: TimeoutSubscription[] = [];

  @Prop(Array) currencies!: Currency[];
  @Prop(String) selectedNetwork!: string;
  @Prop(String) filterValue!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get mainText() {
    if (!this.isOnline) return 'common.offlineStatus';

    return this.filterValue !== '' ? 'wallet.nothingFound' : 'wallet.allAssetsHidden';
  }

  get showAllAssetsHiddenText() {
    const visibleCurrencies = this.currencies.filter((currency) =>
      currency.getCurrencyVisibility(this.selectedWallet.address)
    );

    return visibleCurrencies.length === 0 && !this.showAssetsManagementForm;
  }

  get filteredCurrencies() {
    return this.currencies;
  }

  set filteredCurrencies(currencies) {
    this.setCurrencies({
      currencies,
      address: this.selectedWallet.address,
      network: this.selectedNetwork,
    });
  }

  timeoutCallback(fn: () => void) {
    this.timeoutSubscriptions.forEach(({ subscription }) => {
      clearTimeout(subscription);
    });

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
