<template>
  <div class="auth-content" width="100%">
    <div class="row">
      <router-link :to="to" v-slot="{ navigate }">
        <div class="row-content" @click="navigate">
          <div class="col">
            <Favicon :url="dAppUrl" />
            <span class="auth-item-name">{{ stripedUrl }}</span>
          </div>
          <Icon icon="chevron-right" className="chevron-right" />
        </div>
      </router-link>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import type { SessionTypes } from '@walletconnect/types';
import { Components } from '@/router/routes';
import Favicon from '@/components/Favicon.vue';

type Props = {
  request: SessionTypes.Struct;
  to?: {
    name: typeof Components;
    params: Record<string, string>;
  };
  url?: string;
};

const { request } = defineProps<Props>();
const to = { name: Components.WalletConnectAuthDetails, params: { topic: request.topic } };
const stripedUrl = computed(() => stripUrl(request.peer.metadata.url));
const dAppUrl = computed(() => request.peer.metadata.url);
</script>

<style lang="scss" scoped>
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  &-content {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}
.auth-item-name {
  font-size: 16px;
}

.auth-content {
  cursor: pointer;
  padding: 16px 0;
  border-bottom: 1px solid $default-background-color;
}
.chevron-right {
  width: 20px;
  height: 20px;
  color: $gray-color;
}
.authorized-account__count {
  white-space: nowrap;
  color: rgba(0, 238, 119, 1);
}

.trash {
  height: 16px;
  width: 16px;
}
.icon-duck {
  display: inline-block;
  width: 24px;
  height: 24px;
}
.col {
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
