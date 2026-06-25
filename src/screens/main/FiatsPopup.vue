<template>
  <SelectPopup
    verticalPlacement="top"
    horizontalPlacement="right"
    placeholder="common.searchCurrency"
    :value="accountsStore.selectedFiat"
    :top="50"
    :showAnimation="showAnimation"
    :options="filteredOptionsFiats"
    @toggleValue="toggleSelectedFiat"
    @handlerClose="$emit('handlerClose')"
    @handlerFilter="handlerFilter"
  />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { updateFiatSymbol } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'FiatsPopup' ,
  props: {
    showAnimation: Boolean,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      filterValue: '',
    };
  },
  computed: {
    filteredOptionsFiats() {
      const filter = this.filterValue.trim().toLowerCase();

          return this.networksStore.fiats
            .filter(({ name }) => name.toLowerCase().includes(filter))
            .map(({ name, id, icon }) => {
              return { name: name, value: id, icon };
            });
    },
  },
  methods: {
    handlerFilter(value: string) {
      this.filterValue = value;
    },
    toggleSelectedFiat(id: string) {
      updateFiatSymbol(id).then(() => {
            this.accountsStore.setSelectedFiat(id);

            this.$emit('handlerClose');
          });
    },
  },
});
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: $default-height-page;
}
</style>
