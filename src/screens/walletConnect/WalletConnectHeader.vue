<template>
  <Fragment>
    <Favicon :url="url" :width="80" class="auth-favicon" />
    <div class="header">{{ title }}</div>
    <div v-if="subtext" class="subtext">{{ subtext }}</div>
  </Fragment>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { Fragment } from 'vue-fragment';
import { useI18n } from 'vue-i18n-composable';
import Favicon from '@/components/Favicon.vue';
const { t } = useI18n();
const props = withDefaults(defineProps<{ url: string; subtext?: string; name: string; isTx: boolean }>(), {
  isTx: false,
});
const subtext = computed(() => (props.subtext ? t(props.subtext) : ''));
const title = computed(() => {
  if (props.isTx) return t('walletConnect.txRequestTitle', { url: props.name });

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
.subtext {
  font-size: 16px;
  font-weight: 400;
  max-width: 400px;
  color: $gray-color;
}
</style>
