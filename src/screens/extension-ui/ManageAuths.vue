<template>
  <Fragment>
    <Tabs :activeTab="activeTab" :tabs="tabs" @update:activeTab="onActiveTabUpdate" />

    <div class="scroll-container">
      <Scroll>
        <router-view></router-view>
      </Scroll>
    </div>
  </Fragment>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router/composables';
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

const activeTab = computed(() => route.path);

const onActiveTabUpdate = (tab: { label: string; name: Components; type: string; component: Components }) => {
  if (route.name !== tab.name) router.push({ name: tab.component, params: { type: tab.type } });
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
</style>
