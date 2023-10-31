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
type Props = {
  url: string;
  subtext?: string;
  title: string;
};
const { t } = useI18n();
const props = defineProps<Props>();
const subtext = computed(() => (props.subtext ? t(props.subtext) : ''));
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
