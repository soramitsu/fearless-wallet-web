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
      <SearchInput v-if="showSearchInput" v-model="filterValue" placeholder="Search in networks" class="search" />

      <CircleButton iconType="filter" backgroundColor="none" :handler="filter" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import type { TabWallet } from '@/interfaces/walletPage';
import TabButton from '@/components/TabButton.vue';
import CircleButton from '@/components/CircleButton.vue';
import SearchInput from '@/components/SearchInput.vue';

@Component({
  components: {
    TabButton,
    CircleButton,
    SearchInput,
  },
})
export default class extends Vue {
  readonly tabsOptions: TabWallet[] = ['Currencies', 'NFTs'];

  filterValue = '';

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: TabWallet;
  @Prop(Function) handlerFilter!: (value: string) => void;

  get showSearchInput() {
    return this.syncedActiveTabName === 'Currencies';
  }

  @Watch('filterValue')
  filter(value: string) {
    this.handlerFilter(value);
  }

  openTab(name: TabWallet) {
    this.syncedActiveTabName = name;
  }

  search() {
    alert('search');
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
    margin-right: 10px;
  }
}
</style>
