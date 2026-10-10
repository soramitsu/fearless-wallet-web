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

      <div v-else-if="notNftTabActive" class="manage-filters">
        <button
          type="button"
          class="filter-chip"
          data-testid="filterHidden"
          :aria-pressed="manageHiddenOnly"
          @click="$emit('update:manageHiddenOnly', !manageHiddenOnly)"
        >
          {{ $t('portfolioPage.filterHidden', { count: hiddenAssetCount }) }}
        </button>
        <button
          type="button"
          class="filter-chip"
          data-testid="filterTestnets"
          :aria-pressed="showTestnets"
          @click="$emit('update:showTestnets', !showTestnets)"
        >
          {{ $t('portfolioPage.testnets') }}
        </button>
      </div>
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

    <div v-if="!syncedShowAssetsManagementForm && notNftTabActive" class="hide-zero" data-testid="hideZeroToggle">
      <Switcher
        :value="hideZero"
        :activeText="$t('wallet.hideZero')"
        :inactiveText="$t('wallet.hideZero')"
        @change="$emit('update:hideZero', $event)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { TabWallet } from '@/interfaces/common';
import { Components } from '@/router/routes';

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
    hideZero: Boolean,
    showTestnets: Boolean,
    hiddenAssetCount: { type: Number, default: 0 },
    manageHiddenOnly: Boolean,
    activeTabName: { type: String },
    filterValue: { type: String },
    showAssetsManagementForm: { type: Boolean },
  },
  data() {
    return {};
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

          baseTabs.push({
              label: 'wallet.nfts',
              tabName: Components.Nfts,
              tooltipText: 'wallet.nonFungibleTokens',
              classes: 'currencies-tab',
              target: '.currencies-tab',
            });

          return baseTabs;
    },
    target() {
      return `.${this.iconName}`;
    },
    searchInputWidth() {
      return '100%';
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
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: 10px;
  margin-right: 16px;

  .manage-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-chip {
    min-height: 32px;
    padding: 0 12px;
    border: $default-border;
    border-radius: 16px;
    background: $secondary-background-color;
    color: $grayish-white;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;

    &[aria-pressed='true'] {
      border-color: $pink-lavender-color;
      background: $pink-purple-color;
      color: $plain-white;
    }

    &:focus-visible {
      outline: 2px solid $pink-lavender-color;
      outline-offset: 2px;
    }
  }

  .hide-zero {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 8px;
    color: $grayish-white;
    font-size: 0.75rem;
  }

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
