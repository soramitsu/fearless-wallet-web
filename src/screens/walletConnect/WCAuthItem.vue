<template>
  <div class="auth-content" width="100%">
    <div class="row">
      <router-link
        :to="{ name: Components.WCAuthDetails, params: { topic: request.topic } }"
        v-slot="{ navigate }"
        @onRemove="onRemoveAuth"
      >
        <div class="row-content" @click="navigate">
          <div class="col">
            <ExternalLogo :name="faviconURl" alt="favicon" />

            <span class="auth-item-name">{{ stripedUrl }}</span>
          </div>

          <span class="authorized-account__count">{{ authorizedAccounts }}</span>
        </div>
      </router-link>

      <Icon className="trash row-controls" icon="trash" @click="onRemoveAuth" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { SessionTypes } from '@walletconnect/types';
import { Components } from '@/router/routes';

const emit = defineEmits(['onRemove']);
const { request } = defineProps<{ request: SessionTypes.Struct; token: string }>();

const stripedUrl = computed(() => stripUrl(request.peer.metadata.url));

const faviconURl = computed(() => {
  const host = new URL(request.peer.metadata.url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});

const authorizedAccounts = computed(() => {
  const authListLength = 1;

  return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
});

const onRemoveAuth = () => emit('onRemove', request.topic);
</script>

<style lang="scss" scoped>
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
}
.row {
  display: flex;
  align-items: center;
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
