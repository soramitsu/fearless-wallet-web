<template>
  <div class="header">
    <div class="header-part">
      <TabButton
        v-for="tabName in tabsOptions"
        :key="tabName"
        :name="tabName"
        :isActive="activeTabName === tabName"
        class="tab"
        @click.native="openTab(tabName)"
      />
    </div>
    <div class="header-part">
      <CircleButton iconType="search" backgroundColor="none" class="search-button" @click="search" />

      <CircleButton iconType="filter" backgroundColor="none" @click="filter" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync } from 'vue-property-decorator';
import type { TabWallet } from '@/interfaces/walletPage';
import TabButton from '@/components/TabButton.vue';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: { TabButton, CircleButton },
})
export default class extends Vue {
  tabsOptions: TabWallet[] = ['Currencies', 'NFTs'];

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;

  openTab(name: TabWallet) {
    this.syncedActiveTabName = name;
  }

  search() {
    alert('search');
  }

  filter() {
    alert('filter');
  }
}
</script>

<style lang="scss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  width: 100%;

  .header-part {
    display: flex;
    align-items: center;
    margin-right: 16px;

    .tab {
      margin-right: 12px;
    }
  }

  i {
    color: rgba(255, 255, 255, 0.65);
    margin-left: 24px;

    &:hover {
      cursor: pointer;
    }
  }

  .search-button {
    margin-right: 10px;
  }
}
</style>
