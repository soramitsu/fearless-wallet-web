<template>
  <div class="content-settings">
    <div class="settings-part">
      <template v-if="!syncedShowAssetsManagementForm">
        <TabButton
          v-for="{ label, tabName, tooltipText, target, classes } in tabsOptions"
          class="tab"
          :key="tabName"
          :tooltipText="tooltipText"
          :target="target"
          :class="classes"
          :label="label"
          :isActive="syncedActiveTabName === tabName"
          data-testid="optTab"
          @click="openTab(tabName)"
        />
      </template>

      <TabButton
        v-else-if="notNftTabActive"
        tooltipText="wallet.turnVisibilityAssets"
        class="hide-zero"
        target=".hide-zero"
        placementTooltip="right"
        :label="toggleButtonText"
        @click="$emit('toggleCurrenciesVisible', allCurrenciesHidden)"
      />
    </div>

    <div class="settings-part">
      <SearchInput
        v-if="!syncedShowAssetsManagementForm"
        :value="syncedFilterValue"
        :width="searchInputWidth"
        placeholder="common.search"
        class="search"
        data-testid="searchInput"
        @change="changeSyncedFilterValue"
      />

      <CircleButton
        backgroundColor="none"
        tooltipText="wallet.assetManagement"
        placement="left"
        :target="target"
        :iconName="iconName"
        data-testid="filterBtn"
        @click="toggleAssetsManagementVisible"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { TabWallet } from '@/interfaces/common';
import type { SelectedWallet } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import { isExtension } from '@/helpers';

interface TabsOptions {
  label: string;
  tabName: TabWallet;
  tooltipText: string;
  classes: string;
  target: string;
}

@Component
export default class ContentSettings extends Vue {
  readonly tabsOptions: TabsOptions[] = [
    {
      label: 'wallet.currencies',
      tabName: Components.Currencies,
      tooltipText: 'wallet.fungibleTokens',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
    {
      label: 'wallet.nfts',
      tabName: Components.Nfts,
      tooltipText: 'wallet.nonFungibleTokens',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
  ];

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;
  @PropSync('filterValue', { type: String }) syncedFilterValue!: string;
  @PropSync('showAssetsManagementForm', { type: Boolean }) syncedShowAssetsManagementForm!: boolean;
  @Prop(Array) balances!: TokenGroup[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];

  get target() {
    return `.${this.iconName}`;
  }

  get allCurrenciesHidden() {
    return this.balances.every(({ groupId }) => this.hiddenAssets.includes(groupId));
  }

  get searchInputWidth() {
    return isExtension() ? '185px' : '100%';
  }

  get toggleButtonText() {
    return this.allCurrenciesHidden ? 'wallet.showAllBalances' : 'wallet.hideZero';
  }

  get iconName() {
    return this.syncedShowAssetsManagementForm ? 'close' : 'filter';
  }

  get notNftTabActive() {
    return this.syncedActiveTabName !== Components.Nfts;
  }

  openTab(name: TabWallet) {
    this.syncedActiveTabName = name;
  }

  changeSyncedFilterValue(value: string) {
    this.syncedFilterValue = value;
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
    font-size: 0.875em;
    line-height: 18px;
    margin-left: 8px;
    user-select: none;
  }
}

.fw-web {
  .content-settings {
    flex-wrap: wrap;
    gap: 10px;
    flex-grow: 2;

    .search-input-wrapper {
      flex-grow: 2;
    }
  }
}
</style>
