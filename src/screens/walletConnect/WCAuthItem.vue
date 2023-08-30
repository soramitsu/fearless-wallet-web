<template>
  <!-- <router-link :to="{ name: Components.UpdateAuths }"> -->
  <SCol class="auth-content" width="100%" @click.native="onClick">
    <div class="row">
      <SCol :span="9" class="col">
        <ExternalLogo :name="faviconURl" alt="favicon" />
        <span class="auth-item-name">{{ stripedUrl }}</span>
      </SCol>

      <SCol :span="3">
        <SRow flex justify="space-between">
          <span class="authorized-account__count">
            {{ authorizedAccounts }}
          </span>

          <Icon icon="trash" className="trash" @click="onRemoveAuth" />
        </SRow>
      </SCol>
    </div>
  </SCol>
  <!-- </router-link> -->
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { SessionTypes } from '@walletconnect/types';
import type { CustomEvent } from '@/interfaces';
import { useStore } from '@/store';
// import { Components } from '@/router/routes';

const store = useStore();

const { request } = defineProps<{ request: SessionTypes.Struct }>();
const emits = defineEmits(['openUpdateAuths']);

const stripedUrl = computed(() => stripUrl(request.peer.metadata.url));

const faviconURl = computed(() => {
  const host = new URL(request.peer.metadata.url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});

const authorizedAccounts = computed(() => {
  const authListLength = 1;

  return `${authListLength} account${authListLength !== 1 ? 's' : ''}`;
});

const onRemoveAuth = () => store.dispatch('DELETE_AUTH_CONNECTION', stripedUrl);

const onClick = (event: CustomEvent) => {
  const classList = event.target?.classList;

  if (!classList.contains('trash')) emits('openUpdateAuths', stripedUrl);
};
</script>

<style lang="scss" scoped>
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
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
.row {
  display: flex;
  align-items: center;
}
</style>
