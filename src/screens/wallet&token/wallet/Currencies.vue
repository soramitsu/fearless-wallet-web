<template>
  <Draggable v-model="filteredCurrencies" handle=".handle">
    <CurrencyItem
      v-for="currency in filteredCurrencies"
      :key="currency.token"
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
import { accountController } from '@/controllers/accountController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

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
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get filteredCurrencies() {
    return this.currencies;
  }

  set filteredCurrencies(currencies) {
    const { address } = this.selectedWallet;
    const sequence = currencies.map(({ token }) => token);

    this.setCurrencies({ currencies });

    accountController.setSequenceTokens(sequence, address);
  }
}
</script>
