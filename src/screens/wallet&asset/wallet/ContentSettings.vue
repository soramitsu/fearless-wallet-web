<template>
  <div class="content-settings">
    <div class="settings-part">
      <template v-if="!syncedShowAssetsManagementForm">
        <TabButton
          v-for="{ tabName, tooltipText, target, classes } in tabsOptions"
          class="tab"
          :key="tabName"
          :tooltipText="tooltipText"
          :target="target"
          :class="classes"
          :text="tabName"
          :isActive="activeTabName === tabName"
          @click="openTab(tabName)"
        />
      </template>

      <TabButton
        v-else
        tooltipText="Turn off the visibility of assets with zero balances"
        class="hide-zero"
        target=".hide-zero"
        placementTooltip="right"
        :text="toggleButtonText"
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

      <CircleButton
        backgroundColor="none"
        tooltipText="Asset management"
        placement="left"
        :target="target"
        :iconName="iconName"
        @click="toggleAssetsManagementVisible"
      />
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

interface TabsOptions {
  tabName: TabWallet;
  tooltipText: string;
  classes: string;
  target: string;
}

@Component({
  components: {
    TabButton,
    CircleButton,
    SearchInput,
    Switcher,
  },
})
export default class ContentSettings extends Vue {
  readonly tabsOptions: TabsOptions[] = [
    {
      tabName: 'Currencies',
      tooltipText: 'Fungible tokens',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
    // {
    //   tabName: 'NFTs',
    //   tooltipText: 'Non fungible tokens',
    //   classes: 'nft-tab',
    //   target: '.nft-tab',
    // },
  ];

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;
  @PropSync('filterValue', { type: String }) syncedFilterValue!: TabWallet;
  @PropSync('showAssetsManagementForm', { type: Boolean }) syncedShowAssetsManagementForm!: boolean;
  @Prop(Array) currencies!: Currency[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get target() {
    return `.${this.iconName}`;
  }

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
.content-settings {
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
    color: $grayish-white;
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
