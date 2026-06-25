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
        @click="$emit('toggleCurrenciesVisible', allTokenGroupsHidden)"
      />
    </div>

    <div class="settings-part">
      <SearchInput
        v-if="!syncedShowAssetsManagementForm"
        :value="syncedFilterValue"
        :width="searchInputWidth"
        placeholder="common.search"
        data-testid="searchInput"
        @change="changeSyncedFilterValue"
      />

      <CircleButton
        v-if="!isTonWallet"
        backgroundColor="none"
        tooltipText="wallet.assetManagement"
        placement="left"
        :target="target"
        :iconName="iconName"
        data-testid="filterBtn"
        class="filter-btn"
        @click="toggleAssetsManagementVisible"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { TabWallet } from '@/interfaces/common';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

interface TabsOptions {
  label: string;
  tabName: TabWallet;
  tooltipText: string;
  classes: string;
  target: string;
}

export default defineComponent({ name: 'ContentSettings' ,
  props: {
    tokenGroups: Array,
    activeTabName: { type: String },
    filterValue: { type: String },
    showAssetsManagementForm: { type: Boolean },
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    tabsOptions() {
      const baseTabs: TabsOptions[] = [
            {
              label: 'wallet.currencies',
              tabName: Components.Currencies,
              tooltipText: 'wallet.fungibleTokens',
              classes: 'currencies-tab',
              target: '.currencies-tab',
            },
          ];

          if (!this.accountsStore.selectedWallet.isTon)
            baseTabs.push({
              label: 'wallet.nfts',
              tabName: Components.Nfts,
              tooltipText: 'wallet.nonFungibleTokens',
              classes: 'currencies-tab',
              target: '.currencies-tab',
            });

          return baseTabs;
    },
    isTonWallet() {
      return this.accountsStore.selectedWallet.isTon;
    },
    target() {
      return `.${this.iconName}`;
    },
    allTokenGroupsHidden() {
      return this.tokenGroups.every(({ groupId }) => this.accountsStore.hiddenAssets.includes(groupId));
    },
    searchInputWidth() {
      return '100%';
    },
    toggleButtonText() {
      return this.allTokenGroupsHidden ? 'wallet.showAllBalances' : 'wallet.hideZero';
    },
    iconName() {
      return this.syncedShowAssetsManagementForm ? 'close' : 'filter';
    },
    notNftTabActive() {
      return this.syncedActiveTabName !== Components.Nfts;
    },
    syncedActiveTabName: {
      get() {
        return this.activeTabName;
      },
      set(value) {
        this.$emit('update:activeTabName', value);
      },
    },
    syncedFilterValue: {
      get() {
        return this.filterValue;
      },
      set(value) {
        this.$emit('update:filterValue', value);
      },
    },
    syncedShowAssetsManagementForm: {
      get() {
        return this.showAssetsManagementForm;
      },
      set(value) {
        this.$emit('update:showAssetsManagementForm', value);
      },
    },
  },
  methods: {
    openTab(name: TabWallet) {
      this.syncedActiveTabName = name;
    },
    changeSyncedFilterValue(value: string) {
      this.syncedFilterValue = value;
    },
    toggleAssetsManagementVisible() {
      this.syncedShowAssetsManagementForm = !this.syncedShowAssetsManagementForm;
    },
  },
});
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

  .filter-btn {
    margin-left: 16px;
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
