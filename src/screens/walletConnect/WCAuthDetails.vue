<template>
  <div class="update-accounts">
    <FButton class="connect-button" width="100%" size="big" fontSize="big" text="disconnect" @click="onDisconnect" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { SessionTypes } from '@walletconnect/types';
import { useStore } from '@/store';

const route = useRoute();
const router = useRouter();
const store = useStore();

const emit = defineEmits(['onRemove']);
const topic = computed(() => route.params.topic);

function checkAuth() {
  const list: SessionTypes.Struct[] | null = store.getters.wcSessions;

  const searchAuth = list?.find((request) => request.topic === topic.value);

  if (!searchAuth) router.back();
}

onBeforeMount(async () => {
  checkAuth();
});

function onDisconnect() {
  emit('onRemove');
  checkAuth();
}
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
}

.connect-button {
  margin-top: 16px;
}
</style>
