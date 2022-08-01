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
          @click.native="openTab(tabName)"
        />
      </template>

      <template v-else>
        <Switcher v-model="syncedHideZeroBalance" />

        <div class="hide-balance-text">Hide with empty balance</div>
      </template>
    </div>
    <div v-if="isCurrenciesTab" class="settings-part">
      <SearchInput v-if="!showAssetsManagementForm" v-model="filterValue" placeholder="Search" class="search" />

      <CircleButton
        v-if="showAssetsManagementButton"
        :iconName="iconName"
        backgroundColor="none"
        @click="toggleAssetsManagementVisible"
      />
    </div>
  </div>
</template>

<script lang="ts">
import TabButton from '@/components/TabButton.vue';
import CircleButton from '@/components/CircleButton.vue';
import SearchInput from '@/components/SearchInput.vue';
import Switcher from '@/components/Switcher.vue';
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import type { TabWallet } from '@/interfaces/common';

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

  filterValue = '';

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;
  @PropSync('showAssetsManagementForm', { type: Boolean }) syncedShowAssetsManagementForm!: boolean;
  @PropSync('hideZeroBalance', { type: Boolean }) syncedHideZeroBalance!: boolean;
  @Prop(Boolean) showAssetsManagementButton!: boolean;
  @Prop(Function) handlerFilter!: (value: string) => void;

  get iconName() {
    return this.syncedShowAssetsManagementForm ? 'close' : 'filter';
  }

  get isCurrenciesTab() {
    return this.syncedActiveTabName === 'Currencies';
  }

  @Watch('filterValue')
  filter(value: string) {
    this.handlerFilter(value);
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
    width: 185px;
  }

  .hide-balance-text {
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    margin-left: 8px;
  }
}
</style>
