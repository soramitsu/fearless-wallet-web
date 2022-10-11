<template>
  <div class="settings">
    <div class="settings-part">
      <template v-if="!syncedShowAssetsManagementForm">
        <TabButton
          v-for="tabName in tabsOptions"
          class="tab"
          :key="tabName"
          :name="tabName"
          :isActive="activeTabName === tabName"
          @click="openTab(tabName)"
        />
      </template>

      <TabButton
        v-else
        name="Hide zero balances"
        title="turn off the visibility of assets with zero balances"
        @click="$emit('toggleCurrenciesVisible')"
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
import { Component, Vue, PropSync } from 'vue-property-decorator';
import type { TabWallet } from '@/interfaces/common';
import TabButton from '@/components/TabButton.vue';
import CircleButton from '@/components/CircleButton.vue';
import SearchInput from '@/components/SearchInput.vue';
import Switcher from '@/components/Switcher.vue';

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
