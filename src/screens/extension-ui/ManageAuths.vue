<template>
  <Fragment>
    <Tabs :activeTab="activeTab" :tabs="tabs" @update:activeTab="onActiveTabUpdate" />

    <Scroll>
      <router-view></router-view>
    </Scroll>
  </Fragment>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router/composables';
import { Components } from '@/router/routes';
import router from '@/router';

const tabs = {
  substrate: {
    label: 'common.substrate',
    name: Components.SubstrateAuths,
  },
  wc: {
    label: 'common.wc',
    name: Components.WcAuths,
  },
};

const route = useRoute();

const activeTab = ref(route.name);

const onActiveTabUpdate = (value: Components.SubstrateAuths | Components.WcAuths) => {
  if (route.name !== value) {
    router.push({ name: value });
    activeTab.value = value;
  }
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
</style>
