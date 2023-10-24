<template>
  <Fragment>
    <Favicon :url="url" :width="80" class="auth-favicon" />
    <div class="header">{{ title }}</div>
  </Fragment>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { Fragment } from 'vue-fragment';
import { useI18n } from 'vue-i18n-composable';
import Favicon from '@/components/Favicon.vue';
const { t } = useI18n();
const props = withDefaults(defineProps<{ url: string; name: string; isTx: boolean }>(), {
  isTx: false,
});

const title = computed(() => {
  if (props.isTx) return t('walletConnect.txRequestTitle', { url: name });

  return t('walletConnect.signRequestTitle');
});
</script>

<style scoped lang="scss">
.auth-favicon {
  margin: 30px;
}
.header {
  font-size: 22px;
  font-weight: 800px;
}
</style>
