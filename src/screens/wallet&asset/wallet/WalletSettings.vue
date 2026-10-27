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

    <div class="settings-part search-part">
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

    <div v-if="notNftTabActive" class="view-controls">
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

      <div class="view-end">
        <div v-if="!syncedShowAssetsManagementForm" class="hide-zero" data-testid="hideZeroToggle">
          <Switcher
            :value="hideZero"
            :activeText="$t('wallet.hideZero')"
            :inactiveText="$t('wallet.hideZero')"
            @change="$emit('update:hideZero', $event)"
          />
        </div>

        <!-- The list (Currencies.vue) teleports its Refresh here, so it shares this row instead of taking one below. -->
        <span v-if="refreshSlotId" :id="refreshSlotId" class="refresh-slot"></span>
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
  tooltipText: string;
  classes: string;
  target: string;
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
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
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

  // Hide zero balances and Refresh end the view row, in normal use and in Manage alike.
  .view-end {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .hide-zero {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: $grayish-white;
    font-size: 0.75rem;
  }

  .refresh-slot {
    display: contents;
  }

  .settings-part {
    display: flex;
    align-items: center;
    height: 42px;

    .tab {
      margin: auto 12px auto 0;
    }
  }

  // Tabs, search and Manage share the first row: the field takes the room the tabs leave.
  .search-part {
    flex: 1 1 200px;
    min-width: 0;
    justify-content: flex-end;

    :deep(.search-input-wrapper) {
      flex: 1 1 auto;
      min-width: 0;
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

@include v1-palette {
  .content-settings {
    gap: 12px;
    .settings-part {
      height: auto;
      min-height: 44px;
    }
    // The row gap already separates it from the tabs.
    .view-controls {
      margin-top: 0;
    }
  }
}
</style>
