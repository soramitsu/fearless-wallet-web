<template>
    <Tabs class="connection-tabs" :activeTab="activeTab" :tabs="tabs" @update:activeTab="onActiveTabUpdate" />

    <div class="scroll-container">
      <Scroll>
        <router-view></router-view>
      </Scroll>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Components } from '@/router/routes';
import router from '@/router';

const tabs = {
  substrate: {
    label: 'common.substrateDApps',
    name: '/dapps/substrate',
    type: 'substrate',
    component: Components.DAppsAuths,
  },
  evm: {
    label: 'common.evmDApps',
    name: '/dapps/evm',
    type: 'evm',
    component: Components.DAppsAuths,
  },
  wc: {
    label: 'common.wc',
    name: '/wc',
    component: Components.WcAuths,
  },
};

const route = useRoute();

const activeTab = computed(() => {
  if (route.name === Components.WcAuths) return tabs.wc.name;
  if (route.name === Components.DAppsAuths && route.params.type === 'evm') return tabs.evm.name;
  if (route.name === Components.DAppsAuths && route.params.type === 'substrate') return tabs.substrate.name;
  return '';
});

const onActiveTabUpdate = (tab: { label: string; name: Components; type: string; component: Components }) => {
  if (activeTab.value !== tab.name) router.push({ name: tab.component, params: { type: tab.type } });
};
</script>

<style lang="scss" scoped>
.search-input {
  margin-bottom: 16px;
}

.auth-items {
  height: calc(100% - 60px);
}

.no-auths {
  padding: 20px;
}

.scroll-container {
  height: calc(100% - 23px);
}

.connection-tabs {
  flex-wrap: wrap;
  :deep(.button) {
    flex: 1 1 120px;
    min-width: 0;
  }
  :deep(.tab-button) {
    width: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
  }
}
</style>
