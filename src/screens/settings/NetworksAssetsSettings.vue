<template>
  <NetworkManagement @handlerClose="close" />
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import { Components } from '@/router/routes';

const router = useRouter();
const close = () => router.push({ name: Components.Settings });
</script>
