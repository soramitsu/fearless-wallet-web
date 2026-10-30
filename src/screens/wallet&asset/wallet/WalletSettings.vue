<template>
  <div class="content-settings" :class="{ 'content-settings--manage': syncedShowAssetsManagementForm }">
    <div class="toolbar-row">
      <div v-if="!syncedShowAssetsManagementForm" class="tabs" role="group" :aria-label="$t('walletHome.tabs.label')">
        <button
          v-for="{ label, tabName } in tabsOptions"
          :key="tabName"
          type="button"
          class="tab"
          :class="{ 'tab--active': syncedActiveTabName === tabName }"
          :aria-current="syncedActiveTabName === tabName ? 'page' : undefined"
          :data-tab="tabName"
          data-testid="optTab"
          @click="openTab(tabName)"
        >
          {{ $t(label) }}
        </button>
      </div>
      <p v-else class="manage-title">{{ $t('walletHome.toolbar.manageTitle') }}</p>

      <div v-if="listTabActive" class="toolbar-actions">
        <button
          v-if="!syncedShowAssetsManagementForm"
          type="button"
          class="icon-button"
          :class="{ 'icon-button--active': searchShown }"
          :aria-label="$t(searchShown ? 'walletHome.toolbar.closeSearch' : 'walletHome.toolbar.search')"
          :aria-expanded="searchShown"
          data-testid="searchToggle"
          @click="toggleSearch"
        >
          <Icon :icon="searchShown ? 'close' : 'search'" width="20px" height="20px" :hover="false" />
        </button>

        <!-- The list (Currencies.vue) teleports its Refresh here, so it sits with the other list tools. -->
        <span v-if="refreshSlotId" :id="refreshSlotId" class="refresh-slot"></span>

        <CircleButton
          backgroundColor="none"
          tooltipText="wallet.assetManagement"
          placement="left"
          :ariaLabel="$t(syncedShowAssetsManagementForm ? 'walletHome.toolbar.done' : 'walletHome.toolbar.manage')"
          :target="target"
          :iconName="iconName"
          data-testid="filterBtn"
          class="filter-btn"
          @click="toggleAssetsManagementVisible"
        />
      </div>
    </div>

    <div v-if="searchShown && listTabActive && !syncedShowAssetsManagementForm" class="search-row">
      <SearchInput
        :value="syncedFilterValue"
        width="100%"
        placeholder="walletHome.toolbar.searchPlaceholder"
        data-testid="searchInput"
        @change="changeSyncedFilterValue"
      />
    </div>

    <!-- Manage: which assets the list shows, and how it groups them. -->
    <div v-if="syncedShowAssetsManagementForm && listTabActive" class="manage-panel">
      <div class="manage-filters">
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

      <div class="view-controls">
        <span class="control-label">{{ $t('walletHome.toolbar.groupBy') }}</span>
        <div class="segmented" role="group" :aria-label="$t('portfolioPage.lens.label')" data-testid="portfolioLens">
          <button
            v-for="option in lensOptions"
            :key="option.value"
            type="button"
            class="segment"
            :aria-pressed="lens === option.value"
            :data-testid="`portfolioLens-${option.value}`"
            @click="$emit('update:lens', option.value)"
          >
            {{ $t(option.label) }}
          </button>
        </div>

        <!-- Only for wallets that ordered their assets in 3.0.5: that order is kept until Value is picked. -->
        <div
          v-if="lens === 'token' && showSortControl"
          class="segmented"
          role="group"
          :aria-label="$t('portfolioPage.sort.label')"
          data-testid="portfolioSort"
        >
          <button
            v-for="option in sortOptions"
            :key="option.value"
            type="button"
            class="segment"
            :aria-pressed="sort === option.value"
            :data-testid="`portfolioSort-${option.value}`"
            @click="$emit('update:sort', option.value)"
          >
            {{ $t(option.label) }}
          </button>
        </div>

        <div class="hide-zero" data-testid="hideZeroToggle">
          <Switcher
            :value="hideZero"
            :activeText="$t('wallet.hideZero')"
            :inactiveText="$t('wallet.hideZero')"
            @change="$emit('update:hideZero', $event)"
          />
        </div>
      </div>
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
}

export default defineComponent({ name: 'ContentSettings' ,
  props: {
    tokenGroups: Array,
    hideZero: Boolean,
    showTestnets: Boolean,
    lens: { type: String, default: 'token' },
    sort: { type: String, default: 'value' },
    /** The wallet has a 3.0.5 custom order to keep. */
    showSortControl: Boolean,
    hiddenAssetCount: { type: Number, default: 0 },
    manageHiddenOnly: Boolean,
    /** The id of the place in the view row where the list puts its Refresh. */
    refreshSlotId: { type: String, default: '' },
    activeTabName: { type: String },
    filterValue: { type: String },
    showAssetsManagementForm: { type: Boolean },
    /** The Portfolio tab (the allocation chart) comes with the dashboard (src/portfolio/dashboard/dashboardFlag.ts). */
    showPortfolioTab: Boolean,
    /** All wallets lists what every wallet holds: it has no NFTs, search or Manage of its own. */
    allWallets: Boolean,
  },
  emits: [
    'update:activeTabName',
    'update:filterValue',
    'update:showAssetsManagementForm',
    'update:hideZero',
    'update:showTestnets',
    'update:manageHiddenOnly',
    'update:lens',
    'update:sort',
  ],
  data() {
    return {
      searchOpen: false,
      lensOptions: [
        { value: 'token', label: 'portfolioPage.lens.tokens' },
        { value: 'network', label: 'portfolioPage.lens.networks' },
      ],
      sortOptions: [
        { value: 'value', label: 'portfolioPage.sort.value' },
        { value: 'custom', label: 'portfolioPage.sort.custom' },
      ],
    };
  },
  computed: {
    tabsOptions(): TabsOptions[] {
      return [
        { label: 'walletHome.tabs.assets', tabName: Components.Currencies },
        ...(this.showPortfolioTab ? [{ label: 'walletHome.tabs.portfolio', tabName: Components.PortfolioAllocation }] : []),
        ...(this.allWallets ? [] : [{ label: 'walletHome.tabs.nfts', tabName: Components.Nfts }]),
      ] as TabsOptions[];
    },
    target() {
      return `.${this.iconName}`;
    },
    // A search typed earlier keeps its field open, so it can always be read and cleared.
    searchShown(): boolean {
      return this.searchOpen || Boolean(this.filterValue);
    },
    listTabActive(): boolean {
      return this.syncedActiveTabName === Components.Currencies && !this.allWallets;
    },
    iconName() {
      return this.syncedShowAssetsManagementForm ? 'close' : 'filter';
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
    toggleSearch() {
      if (this.searchShown) {
        this.searchOpen = false;
        this.syncedFilterValue = '';
        return;
      }

      this.searchOpen = true;
      // The field takes the cursor as it opens.
      void this.$nextTick(() => this.$el.querySelector?.('.search-row input')?.focus());
    },
  },
});
</script>

<style lang="scss" scoped>
// One row: the views on the left, the list's tools on the right (Exodus' wallet list). Everything else is in Manage.
.content-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 6px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  border-bottom: 1px solid var(--fw-divider);
}

.tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  align-self: stretch;
  min-width: 0;
}

.tab {
  position: relative;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--fw-text-2);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;

  // The current view is underlined in the brand's colour, as a tab is.
  &::after {
    content: '';
    position: absolute;
    right: 10px;
    bottom: -1px;
    left: 10px;
    height: 2px;
    border-radius: 2px;
    background: transparent;
  }

  &:hover {
    color: var(--fw-text-1);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.tab--active {
  color: var(--fw-text-1);
  font-weight: 700;

  &::after {
    background: var(--fw-brand);
  }
}

.manage-title {
  margin: 0;
  color: var(--fw-text-1);
  font-size: 0.9rem;
  font-weight: 700;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--fw-text-2);
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
    color: var(--fw-text-1);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 1px;
  }
}

.icon-button--active {
  color: var(--fw-text-1);
}

.refresh-slot {
  display: contents;
}

.filter-btn :deep(button) {
  width: 36px;
  height: 36px;
}

.search-row {
  :deep(.search-input-wrapper) {
    width: 100%;
  }

  // The magnifier says what the field is for; its label stays for screen readers only.
  :deep(.s-placeholder) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.manage-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--fw-divider);
  border-radius: 12px;
  background: var(--fw-raised);
}

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
    border-color: palette($pink-lavender-color, var(--fw-select-edge));
    background: $pink-purple-color;
    color: $plain-white;
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}

.view-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.control-label {
  color: var(--fw-text-2);
  font-size: 0.75rem;
}

.segmented {
  display: inline-flex;
  padding: 2px;
  border: $default-border;
  border-radius: 16px;
  background: $secondary-background-color;
}

.segment {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: $grayish-white;
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;

  &[aria-pressed='true'] {
    background: $pink-purple-color;
    color: $plain-white;
    font-weight: 700;
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 1px;
  }
}

.hide-zero {
  display: flex;
  align-items: center;
  margin-left: auto;
  color: $grayish-white;
  font-size: 0.75rem;
}

// The side panel's column: the views and the three tools still share one row, in every language.
@media (max-width: 380px) {
  .toolbar-row {
    gap: 6px;
  }

  .tabs {
    gap: 0;
  }

  .tab {
    padding: 0 6px;
    font-size: 0.8rem;

    &::after {
      right: 6px;
      left: 6px;
    }
  }

  .toolbar-actions {
    gap: 0;
  }

  .icon-button,
  .filter-btn :deep(button) {
    width: 32px;
    height: 32px;
  }
}
</style>
