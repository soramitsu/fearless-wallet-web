<template>
  <AboveForm
    :header="header"
    :fullScreen="true"
    :showBackIcon="showAuthDetails"
    @closeHandler="onClose"
    @handlerBack="onBack"
  >
    <router-view></router-view>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Components } from '@/router/routes';

const router = useRouter();
const route = useRoute();

const showAuthDetails = computed(() => route.name !== Components.DAppsAuths && route.name !== Components.WcAuths);

const header = computed(() => {
  // Details displays the full origin in its scrolling content.
  if (route.name === Components.DAppDetails) return 'common.manageDApp';
  const authDetailHeader = { text: 'authorize.accountsConnected', localeProps: { url: route.params.index } };

  if (showAuthDetails.value) return authDetailHeader;

  return 'common.manageDApp';
});

const onBack = () => router.back();

const onClose = () => router.push({ name: Components.Settings });
</script>

<style lang="scss" scoped>
.search-input {
  margin-bottom: 16px;
}

.auth-items {
  height: calc(100% - 60px);
}
</style>
