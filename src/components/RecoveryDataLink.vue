<template>
  <FButton v-if="visible" text="storageRecovery.recordsTitle" type="secondary" width="100%"
    data-testid="recoveryDataLink" @click="open" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IS_EXTENSION } from '@/consts/global';
import { getRecoveryRecords } from '@/extension/messaging';
import { Components } from '@/router/routes';

const router = useRouter();
const visible = ref(false);
let disposed = false;
const open = () => router.push({ name: Components.StorageRecovery });

onMounted(async () => {
  if (IS_EXTENSION) return;
  try {
    const records = await getRecoveryRecords();
    if (!disposed) visible.value = records.length > 0;
  } catch {
    // An unreadable inventory still needs a route to the retryable export UI.
    if (!disposed) visible.value = true;
  }
});
onBeforeUnmount(() => { disposed = true; });
</script>
