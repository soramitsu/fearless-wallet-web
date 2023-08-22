<template>
  <SelectPopup
    verticalPlacement="top"
    horizontalPlacement="right"
    placeholder="common.searchCurrency"
    :value="selectedFiat"
    :top="50"
    :showAnimation="showAnimation"
    :options="filteredOptionsFiats"
    :toggleValue="toggleSelectedFiat"
    :handlerClose="handlerClose"
    :handlerFilter="handlerFilter"
  />
</template>

<script lang="ts">
import { Getter, Mutation } from 'vuex-class';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { FiatJson } from '@/interfaces/common';
import type { Fn } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { updateFiatSymbol } from '@/extension/messaging';

@Component
export default class FiatsPopup extends Vue {
  filterValue = '';

  @Prop(Boolean) showAnimation!: boolean;
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.getFiats) fiats!: FiatJson[];
  @Getter(AccountsGettersTypes.getSelectedFiat) selectedFiat!: string;
  @Mutation(AccountsMutationTypes.SET_SELECTED_FIAT) setSelectedFiat!: Fn<string>;

  get filteredOptionsFiats() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.fiats
      .filter(({ name }) => name.toLowerCase().includes(filter))
      .map(({ name, id, icon }) => {
        return { name: name, value: id, icon };
      });
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  toggleSelectedFiat(id: string) {
    updateFiatSymbol(id).then(() => {
      this.setSelectedFiat(id);
      this.handlerClose();
    });
  }
}
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: $default-height-page;
}
</style>
