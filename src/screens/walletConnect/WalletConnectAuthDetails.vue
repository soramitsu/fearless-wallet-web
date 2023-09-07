<template>
  <div class="update-accounts">
    <Favicon v-if="url" :url="url" width="80" class="auth-favicon" />

    <div class="header">{{ title }}</div>
    <Scroll>
      <div v-for="(el, index) in namespaces" class="network" :key="index">
        <div class="network__content">
          <div class="network__name">
            <ExternalLogo :name="el.icon" :alt="el.name" />
            <span>{{ el.name }}</span>
          </div>
          <div class="network__status">
            <span>Connected</span>
            <div class="network__status-indicator" :class="getNetworkStatusClass(el.connected)"></div>
          </div>
        </div>
      </div>
    </Scroll>
    <FButton class="connect-button" width="100%" size="big" fontSize="big" text="disconnect" @click="onDisconnect" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { WALLET_CONNECT_EIP155_NAMESPACE } from '@extension-base/services/wallet-connect-service/consts';
import type { SessionTypes } from '@walletconnect/types';
import type { NetworkJson } from '@extension-base/types';
import { useStore } from '@/store';
import Favicon from '@/components/Favicon.vue';
type ChainData = {
  name: string;
  icon: string;
  connected: boolean;
};
const route = useRoute();
const router = useRouter();
const store = useStore();
const networks = ref<NetworkJson[]>(store.getters.allNetworks);

const emit = defineEmits(['onRemove']);
const topic = computed(() => route.params.topic);

const request = computed(() => {
  const list: SessionTypes.Struct[] | null = store.getters.wcSessions;

  const searchAuth = list?.find((request) => request.topic === topic.value);

  return searchAuth;
});

const url = computed(() => request.value?.peer.metadata.url);
const title = computed(() => `Connected to ${request.value?.peer.metadata.name}`);

const chainNamesFromRequest = (namespaces: SessionTypes.Namespaces, key: string): ChainData[] => {
  const chains = namespaces[key].chains;
  const names: ChainData[] = [];

  if (key === WALLET_CONNECT_EIP155_NAMESPACE && chains) {
    chains.forEach((chain) => {
      const [, chainId] = chain.split(':');
      const net = networks.value.find((el) => parseInt(`0x${el.chainId}`) === +chainId);

      if (net) names.push({ icon: net.icon, name: net.name, connected: net.active });
    });
  }

  return names;
};

const namespaces = computed<ChainData[]>(() => {
  if (!request.value) return [];

  const namespaces = request.value.namespaces;
  const names: ChainData[] = [];

  Object.keys(namespaces).forEach((namespace) => names.push(...chainNamesFromRequest(namespaces, namespace)));

  return names;
});
const getNetworkStatusClass = (status: boolean) => `network__status-indicator--${status ? 'active' : 'inactive'}`;

const checkAuth = () => {
  if (!request.value) router.back();
};

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
  align-items: center;
  height: 100%;
}
.header {
  font-size: 22px;
  font-weight: 800px;
}
.auth-favicon {
  margin: 30px;
}
.connect-button {
  margin-top: 16px;
}
.network {
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
  width: 100%;

  &__content {
    display: flex;
    flex-flow: row nowrap;
    justify-content: space-between;
    flex-grow: 1;
    border: 1px solid transparent;
    border-bottom-color: rgba(255, 255, 255, 0.1);
    margin: 0 16px 0 16px;
    padding: 16px 0 16px 0;
  }

  &__name,
  &__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &__status {
    font-size: 12px;
    color: $gray-color;
  }

  &__name {
    font-size: 16px;
    color: $default-white;
  }

  &__status-indicator {
    width: 9px;
    height: 9px;
    border-radius: 50%;

    &--active {
      background-color: #00ee77;
    }

    &--inactive {
      background-color: $gray-color;
    }
  }
}
</style>
