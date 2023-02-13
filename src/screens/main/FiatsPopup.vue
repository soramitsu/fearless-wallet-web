<template>
  <SelectPopup
    verticalPlacement="top"
    horizontalPlacement="right"
    placeholder="common.searchCurrency"
    :value="selectedFiat"
    :top="50"
    iconType="fiat"
    :showAnimation="showAnimation"
    :options="filteredOptionsFiats"
    :toggleValue="toggleSelectedFiat"
    :handlerClose="handlerClose"
    :handlerFilter="handlerFilter"
  />
</template>

<script lang="ts">
import { Getter, Action } from 'vuex-class';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { FiatJson, TAction } from '@/interfaces/common';
import type { SetSelectedFiat } from '@/store';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class FiatsPopup extends Vue {
  filterValue = '';

  @Prop(Boolean) showAnimation!: boolean;
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.getFiats) fiats!: FiatJson[];
  @Getter(AccountsGettersTypes.getSelectedFiat) selectedFiat!: string;
  @Action(AccountsActionTypes.SET_SELECTED_FIAT) setSelectedFiat!: TAction<SetSelectedFiat>;

  get filteredOptionsFiats() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.fiats
      .filter(({ name }) => name.toLowerCase().includes(filter))
      .map(({ name, id }) => {
        return { label: name, value: id, path: id };
      });
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  toggleSelectedFiat(fiatName: string) {
    this.setSelectedFiat({ fiatName });

    this.handlerClose();
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
