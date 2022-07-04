<template>
  <div class="currencies">
    <Draggable v-model="filteredCurrencies" handle=".handle">
      <CurrencyItem
        v-for="currency in filteredCurrencies"
        :key="currency.mainNetwork"
        :currency="currency"
        :showAssetsManagementForm="showAssetsManagementForm"
        :toggleVisibleActivityForm="toggleVisibleActivityForm"
      />
    </Draggable>
  </div>
</template>

<script lang="ts">
import CurrencyItem from './CurrencyItem.vue';
import Draggable from 'vuedraggable';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getCurrencies } from '@/util/currenciesHelper';
import type { SelectedWallet } from '@/store/accounts/types';
import type { SetCurrenciesProps } from '@/store/networks/types';
import type { TMutation } from '@/interfaces/common';
import type { Currency } from '@/interfaces/currencies';
import type AccountController from '@/controllers/accountController';

@Component({
  components: {
    CurrencyItem,
    Draggable,
  },
})
export default class Currencies extends Vue {
  @Prop(Array) currencies!: Currency[];
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Boolean) hideZeroBalance!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAccountController) accountController!: AccountController;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get filteredCurrencies() {
    if (this.showAssetsManagementForm || !this.hideZeroBalance) return this.currencies;

    return this.currencies.filter((currency) => currency.getTotalCountTokens() !== 0);
  }

  set filteredCurrencies(value) {
    const currencies = getCurrencies(value, this.selectedWallet);

    this.setCurrencies({ currencies });
    this.accountController.setSubsequenceTokens(value.map(({ mainNetwork }) => mainNetwork));
  }
}
</script>

<style lang="scss" scoped>
.currencies {
}
</style>
