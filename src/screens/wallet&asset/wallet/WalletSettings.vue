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
        @click="emit('toggleCurrenciesVisible', allTokenGroupsHidden)"
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

<script lang="ts" setup>
import { computed } from 'vue';
import type { TabWallet } from '@/interfaces/common';
import type { TokenGroup } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

interface TabsOptions {
  label: string;
  tabName: TabWallet;
  tooltipText: string;
  classes: string;
  target: string;
}

defineOptions({
  name: 'ContentSettings',
});

const accountsStore = useAccountsStore();

const props = withDefaults(
  defineProps<{
    activeTabName: TabWallet;
    filterValue: string;
    showAssetsManagementForm: boolean;
    tokenGroups: TokenGroup[];
  }>(),
  {
    tokenGroups: () => [],
  }
);

const emit = defineEmits<{
  'update:activeTabName': [value: TabWallet];
  'update:filterValue': [value: string];
  'update:showAssetsManagementForm': [value: boolean];
  toggleCurrenciesVisible: [value: boolean];
}>();

const syncedActiveTabName = computed({
  get: () => props.activeTabName,
  set: (value: TabWallet) => emit('update:activeTabName', value),
});

const syncedFilterValue = computed({
  get: () => props.filterValue,
  set: (value: string) => emit('update:filterValue', value),
});

const syncedShowAssetsManagementForm = computed({
  get: () => props.showAssetsManagementForm,
  set: (value: boolean) => emit('update:showAssetsManagementForm', value),
});

const tabsOptions = computed(() => {
  const baseTabs: TabsOptions[] = [
    {
      label: 'wallet.currencies',
      tabName: Components.Currencies,
      tooltipText: 'wallet.fungibleTokens',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    },
  ];

  if (!accountsStore.selectedWallet.isTon) {
    baseTabs.push({
      label: 'wallet.nfts',
      tabName: Components.Nfts,
      tooltipText: 'wallet.nonFungibleTokens',
      classes: 'currencies-tab',
      target: '.currencies-tab',
    });
  }

  return baseTabs;
});

const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);

const iconName = computed(() => (syncedShowAssetsManagementForm.value ? 'close' : 'filter'));

const target = computed(() => `.${iconName.value}`);

const allTokenGroupsHidden = computed(() =>
  props.tokenGroups.every(({ groupId }) => accountsStore.hiddenAssets.includes(groupId))
);

const searchInputWidth = computed(() => '100%');

const toggleButtonText = computed(() => (allTokenGroupsHidden.value ? 'wallet.showAllBalances' : 'wallet.hideZero'));

const notNftTabActive = computed(() => syncedActiveTabName.value !== Components.Nfts);

const openTab = (name: TabWallet) => {
  syncedActiveTabName.value = name;
};

const changeSyncedFilterValue = (value: string) => {
  syncedFilterValue.value = value;
};

const toggleAssetsManagementVisible = () => {
  syncedShowAssetsManagementForm.value = !syncedShowAssetsManagementForm.value;
};
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
