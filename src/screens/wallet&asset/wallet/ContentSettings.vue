<template>
  <div class="settings">
    <div class="settings-part">
      <template v-if="!syncedShowAssetsManagementForm">
        <TabButton
          v-for="tabName in tabsOptions"
          class="tab"
          :key="tabName"
          :text="tabName"
          :isActive="activeTabName === tabName"
          @click="openTab(tabName)"
        />
      </template>

      <TabButton
        v-else
        :text="toggleButtonText"
        title="turn off the visibility of assets with zero balances"
        @click="$emit('toggleCurrenciesVisible', allCurrenciesHidden)"
      />
    </div>
    <div v-if="isCurrenciesTab" class="settings-part">
      <SearchInput
        v-if="!showAssetsManagementForm"
        v-model="syncedFilterValue"
        placeholder="Search"
        width="185px"
        class="search"
      />

      <CircleButton :iconName="iconName" backgroundColor="none" @click="toggleAssetsManagementVisible" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { TabWallet } from '@/interfaces/common';
import type { Currency } from '@/interfaces/currencies';
import type { SelectedWallet } from '@/store/accounts/types';
import TabButton from '@/components/TabButton.vue';
import CircleButton from '@/components/CircleButton.vue';
import SearchInput from '@/components/SearchInput.vue';
import Switcher from '@/components/Switcher.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    TabButton,
    CircleButton,
    SearchInput,
    Switcher,
  },
})
export default class ContentSettings extends Vue {
  readonly tabsOptions: TabWallet[] = ['Currencies']; // ['Currencies', 'NFTs']

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;
  @PropSync('filterValue', { type: String }) syncedFilterValue!: TabWallet;
  @PropSync('showAssetsManagementForm', { type: Boolean }) syncedShowAssetsManagementForm!: boolean;
  @Prop(Array) currencies!: Currency[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get allCurrenciesHidden() {
    const visibleCurrencies = this.currencies.filter((currency) =>
      currency.getCurrencyVisible(this.selectedWallet.address)
    );

    return visibleCurrencies.length === 0;
  }

  get toggleButtonText() {
    return this.allCurrenciesHidden ? 'Show all balances' : 'Hide zero balances';
  }

  get iconName() {
    return this.syncedShowAssetsManagementForm ? 'close' : 'filter';
  }

  get isCurrenciesTab() {
    return this.syncedActiveTabName === 'Currencies';
  }

  openTab(name: TabWallet) {
    this.syncedActiveTabName = name;
  }

  toggleAssetsManagementVisible() {
    this.syncedShowAssetsManagementForm = !this.syncedShowAssetsManagementForm;
  }
}
</script>

<style lang="scss" scoped>
.settings {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  margin-right: 16px;

  .settings-part {
    display: flex;
    align-items: center;
    height: 42px;

    .tab {
      margin: auto 12px auto 0;
    }
  }

  i {
    color: rgba(255, 255, 255, 0.65);
    margin-left: 24px;

    &:hover {
      cursor: pointer;
    }
  }

  .search {
    margin-right: 16px;
  }

  .hide-balance-text {
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    margin-left: 8px;
    user-select: none;
  }
}
</style>
