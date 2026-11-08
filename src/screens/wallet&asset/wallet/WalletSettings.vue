<template>
  <div class="content-settings">
    <div class="toolbar-row">
      <div class="tabs" role="group" :aria-label="$t('walletHome.tabs.label')">
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

      <div v-if="listTabActive" class="toolbar-actions">
        <!-- The list (Currencies.vue) teleports its Refresh here, so it sits with the other list tools. -->
        <span v-if="refreshSlotId" :id="refreshSlotId" class="refresh-slot"></span>

        <!-- Manage assets is a page of its own: what the list shows, tokens to add, and hidden ones. -->
        <CircleButton
          backgroundColor="none"
          tooltipText="walletHome.toolbar.manage"
          placement="left"
          :ariaLabel="$t('walletHome.toolbar.manage')"
          target=".filter"
          iconName="filter"
          data-testid="filterBtn"
          class="filter-btn"
          @click="$emit('manage')"
        />
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
    /** The id of the place in the view row where the list puts its Refresh. */
    refreshSlotId: { type: String, default: '' },
    activeTabName: { type: String },
    /** The Portfolio tab (the allocation chart) comes with the dashboard (src/portfolio/dashboard/dashboardFlag.ts). */
    showPortfolioTab: Boolean,
    /** All wallets lists what every wallet holds: it has no NFTs or Manage of its own. */
    allWallets: Boolean,
  },
  emits: ['update:activeTabName', 'manage'],
  computed: {
    tabsOptions(): TabsOptions[] {
      return [
        { label: 'walletHome.tabs.assets', tabName: Components.Currencies },
        ...(this.showPortfolioTab ? [{ label: 'walletHome.tabs.portfolio', tabName: Components.PortfolioAllocation }] : []),
        ...(this.allWallets ? [] : [{ label: 'walletHome.tabs.nfts', tabName: Components.Nfts }]),
      ] as TabsOptions[];
    },
    listTabActive(): boolean {
      return this.syncedActiveTabName === Components.Currencies && !this.allWallets;
    },
    syncedActiveTabName: {
      get() {
        return this.activeTabName;
      },
      set(value) {
        this.$emit('update:activeTabName', value);
      },
    },
  },
  methods: {
    openTab(name: TabWallet) {
      this.syncedActiveTabName = name;
    },
  },
});
</script>

<style lang="scss" scoped>
// One row: the views on the left, the list's tools on the right (Exodus' wallet list). Manage assets is its own page.
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

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.refresh-slot {
  display: contents;
}

.filter-btn :deep(button) {
  width: 36px;
  height: 36px;
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

  .filter-btn :deep(button) {
    width: 32px;
    height: 32px;
  }
}
</style>
