<template>
  <div class="update-accounts">
    <WalletConnectHeader v-if="url" :name="title" :url="url" :isRequest="true" />

    <Scroll>
      <div v-for="(el, index) in namespaces" class="network" :key="index">
        <div class="network__content">
          <div class="network__name">
            <ExternalLogo :name="el.icon" :alt="el.name" />
            <span>{{ el.name }}</span>
          </div>
          <div class="network__status">
            <span>{{ $t('authorize.connected') }}</span>
            <div class="network__status-indicator" :class="getNetworkStatusClass(el.connected)"></div>
          </div>
        </div>
      </div>
    </Scroll>

    <FButton
      class="connect-button"
      width="100%"
      size="big"
      fontSize="big"
      text="authorize.disconnect"
      @click="onWCRemoveuth"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import WalletConnectHeader from './WalletConnectHeader.vue';
import type { SessionTypes } from '@walletconnect/types';
import { transformNamespaces } from '@/util/walletConnect';
import { useStore } from '@/store';
import { disconnectWalletConnectConnection } from '@/extension/messaging/wallet-connect-requests';

type ChainData = {
  name: string;
  icon: string;
  connected: boolean;
};

const route = useRoute();
const router = useRouter();
const store = useStore();

const topic = computed(() => route.params.topic);
const request = computed(() => {
  const list: SessionTypes.Struct[] | null = store.getters.wcSessions;

  return list?.find((request) => request.topic === topic.value);
});

const checkAuth = () => {
  if (!request.value) router.back();
};

onBeforeMount(async () => {
  checkAuth();
});

const url = computed(() => request.value?.peer.metadata.url);
const title = computed(() => request.value?.peer.metadata.name ?? '');

const namespaces = computed<ChainData[]>(() => {
  if (!request.value) return [];

  const namespaces = request.value.namespaces;

  return transformNamespaces(namespaces, true);
});

const getNetworkStatusClass = (status: boolean) => `network__status-indicator--${status ? 'active' : 'inactive'}`;

const onWCRemoveuth = async () => {
  await disconnectWalletConnectConnection(topic.value);
  checkAuth();
};
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;
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
